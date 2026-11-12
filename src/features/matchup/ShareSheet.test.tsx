import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initApp, pickSpecies, setLang, store, updateSet } from '../../state/app'
import { resetAll } from '../../test-utils'
import { hideToast, ToastHost } from '../../ui/Toast'
import { mockDesktop } from '../../ui/mockDesktop'
import { ShareSheet } from './ShareSheet'

beforeEach(async () => {
  await resetAll({ gen: 'champions' })
  await initApp()
  await pickSpecies('mine', 'incineroar')
  await pickSpecies('opp', 'garchomp')
  updateSet('mine', (s) => ({ ...s, moveIds: ['flareblitz'] }))
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'canShare')
  Reflect.deleteProperty(navigator, 'clipboard')
  hideToast()
})

function open(onClose = vi.fn(), anchor?: DOMRect) {
  const row = store.get().calc!.result.moves[0]!
  render(
    <>
      <ShareSheet
        row={row}
        move={{ direction: 'forward', index: 0 }}
        moveName="Flare Blitz"
        defenderName="Garchomp"
        onClose={onClose}
        anchor={anchor}
      />
      <ToastHost />
    </>,
  )
  return onClose
}

const stub = (name: string, value: unknown) =>
  Object.defineProperty(navigator, name, { value, configurable: true })

describe('ShareSheet', () => {
  it('has the title and three actions, enabled once the link is ready', async () => {
    open()
    expect(screen.getByRole('dialog', { name: 'Flare Blitz → Garchomp' })).toBeInTheDocument()
    const share = screen.getByRole('button', { name: /Share calc/ })
    await waitFor(() => expect(share).toBeEnabled())
    expect(screen.getByRole('button', { name: /Copy text/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Copy link/ })).toBeEnabled()
  })

  it('uses navigator.share with the whole message as text only (link last, no url)', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn()
    stub('share', share)
    stub('clipboard', { writeText })
    const onClose = open()
    const btn = screen.getByRole('button', { name: /Share calc/ })
    await waitFor(() => expect(btn).toBeEnabled())
    fireEvent.click(btn)
    expect(share).toHaveBeenCalledTimes(1)
    const arg = share.mock.calls[0]![0] as Record<string, unknown>
    expect(Object.keys(arg)).toEqual(['text'])
    const lines = (arg.text as string).split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('Flare Blitz')
    expect(lines[2]).toMatch(/^http\S+#c2[\w-]+$/)
    expect(writeText).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('falls back to the clipboard when navigator.share throws a non-abort error', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stub('share', vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')))
    stub('clipboard', { writeText })
    open()
    const btn = screen.getByRole('button', { name: /Share calc/ })
    await waitFor(() => expect(btn).toBeEnabled())
    fireEvent.click(btn)
    expect(await screen.findByText('Copied')).toBeInTheDocument()
    expect((writeText.mock.calls[0]![0] as string).split('\n')).toHaveLength(3)
  })

  it('does nothing (no toast, no copy) when the share sheet is dismissed', async () => {
    const writeText = vi.fn()
    stub('share', vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')))
    stub('clipboard', { writeText })
    open()
    const btn = screen.getByRole('button', { name: /Share calc/ })
    await waitFor(() => expect(btn).toBeEnabled())
    fireEvent.click(btn)
    await act(async () => void (await new Promise((r) => setTimeout(r, 20))))
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByText('Copied')).toBeNull()
  })

  it('falls back to copying the full message (incl. link) and toasts "Copied"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stub('clipboard', { writeText })
    open()
    const btn = screen.getByRole('button', { name: /Share calc/ })
    await waitFor(() => expect(btn).toBeEnabled())
    fireEvent.click(btn)
    expect(await screen.findByText('Copied')).toBeInTheDocument()
    const text = writeText.mock.calls[0]![0] as string
    expect(text.split('\n')).toHaveLength(3)
    expect(text.split('\n')[2]).toMatch(/^http.*#c2/)
  })

  it('Copy text = three lines, Copy link = only the link; the toast is German in German', async () => {
    setLang('de')
    const writeText = vi.fn().mockResolvedValue(undefined)
    stub('clipboard', { writeText })
    open()
    const link = screen.getByRole('button', { name: /Link kopieren/ })
    await waitFor(() => expect(link).toBeEnabled())
    fireEvent.click(link)
    expect(await screen.findByText('Kopiert')).toBeInTheDocument()
    expect(writeText.mock.calls[0]![0]).toMatch(/^http\S+#c2[\w-]+$/)
    fireEvent.click(screen.getByRole('button', { name: /Text kopieren/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
    const full = writeText.mock.calls[1]![0] as string
    expect(full.split('\n')).toHaveLength(3)
    expect(full.split('\n')[1]).toContain('Doppel')
  })

  it('the toast is a polite live region that hides itself', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stub('clipboard', { writeText: vi.fn().mockResolvedValue(undefined) })
    open()
    const live = document.querySelector('.toast-host')!
    expect(live.getAttribute('aria-live')).toBe('polite')
    const btn = screen.getByRole('button', { name: /Copy link/ })
    await vi.waitFor(() => expect(btn).toBeEnabled())
    fireEvent.click(btn)
    await vi.waitFor(() => expect(live.textContent).toBe('Copied'))
    act(() => void vi.advanceTimersByTime(2100))
    expect(live.textContent).toBe('')
    vi.useRealTimers()
  })
})

describe('ShareSheet variants', () => {
  const anchor = new DOMRect(100, 200, 400, 40)
  afterEach(() => vi.unstubAllGlobals())

  it('desktop pointer: popover next to the row, Escape closes, no modal dialog markup', async () => {
    mockDesktop(true)
    const onClose = open(vi.fn(), anchor)
    const pop = screen.getByRole('dialog', { name: 'Flare Blitz → Garchomp' })
    expect(pop).toHaveClass('share-popover')
    expect(pop).not.toHaveAttribute('aria-modal')
    expect(document.querySelector('.dialog')).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(3)
    await waitFor(() => expect(screen.getByRole('button', { name: /Copy link/ })).toBeEnabled())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('desktop pointer: an outside click closes it', () => {
    mockDesktop(true)
    const onClose = open(vi.fn(), anchor)
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('touch: the bottom sheet, even with an anchor', () => {
    mockDesktop(false)
    open(vi.fn(), anchor)
    expect(document.querySelector('.dialog--sheet')).not.toBeNull()
    expect(document.querySelector('.share-popover')).toBeNull()
  })
})

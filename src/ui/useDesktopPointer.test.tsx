import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'
import { mockDesktop } from './mockDesktop'
import { DESKTOP_QUERY, useDesktopPointer } from './useDesktopPointer'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useDesktopPointer', () => {
  it('is false without matchMedia (jsdom) and for touch', () => {
    expect(renderHook(() => useDesktopPointer()).result.current).toBe(false)
    mockDesktop(false)
    expect(renderHook(() => useDesktopPointer()).result.current).toBe(false)
  })

  it('follows the media query', () => {
    const set = mockDesktop(true)
    const { result } = renderHook(() => useDesktopPointer())
    expect(result.current).toBe(true)
    set(false)
    expect(result.current).toBe(false)
  })

  it('uses the width + hover + fine pointer query', () => {
    expect(DESKTOP_QUERY).toBe('(min-width: 900px) and (hover: hover) and (pointer: fine)')
  })
})

describe('Dialog on desktop', () => {
  it.each([true, false])('backdrop click closes (desktop=%s)', (desktop) => {
    mockDesktop(desktop)
    const onClose = vi.fn()
    const { container } = render(
      <Dialog title="T" onClose={onClose} closeLabel="Close">
        body
      </Dialog>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(!!container.querySelector('.dialog--desktop')).toBe(desktop)
    fireEvent.click(container.querySelector('.dialog__backdrop')!)
    expect(onClose).toHaveBeenCalledOnce()
  })
})

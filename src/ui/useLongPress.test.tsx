import { act, renderHook } from '@testing-library/react'
import type { MouseEvent, PointerEvent } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLongPress } from './useLongPress'

const down = (x = 0, y = 0, extra: Partial<PointerEvent> = {}) =>
  ({
    isPrimary: true,
    pointerType: 'touch',
    button: 0,
    clientX: x,
    clientY: y,
    ...extra,
  }) as PointerEvent
const move = (x: number, y: number) => ({ clientX: x, clientY: y }) as PointerEvent
const click = () => {
  const e = { preventDefault: vi.fn(), stopPropagation: vi.fn() }
  return e as typeof e & MouseEvent
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function setup() {
  const onLong = vi.fn()
  const { result, unmount } = renderHook(() => useLongPress(onLong))
  return { onLong, h: () => result.current, unmount }
}

describe('useLongPress', () => {
  it('a tap does not fire and its click goes through', () => {
    const { onLong, h } = setup()
    act(() => h().onPointerDown(down()))
    act(() => void vi.advanceTimersByTime(200))
    act(() => h().onPointerUp())
    act(() => void vi.advanceTimersByTime(1000))
    expect(onLong).not.toHaveBeenCalled()
    const c = click()
    h().onClickCapture(c)
    expect(c.preventDefault).not.toHaveBeenCalled()
  })

  it('fires once after 500 ms, vibrates and swallows the click of the release', () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    const { onLong, h } = setup()
    act(() => h().onPointerDown(down()))
    act(() => void vi.advanceTimersByTime(499))
    expect(onLong).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(2))
    expect(onLong).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledWith(10)
    act(() => h().onPointerUp())
    const c = click()
    h().onClickCapture(c)
    expect(c.preventDefault).toHaveBeenCalled()
    expect(c.stopPropagation).toHaveBeenCalled()
    // only that one click: the next tap (or keyboard activation) works again
    const next = click()
    h().onClickCapture(next)
    expect(next.preventDefault).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(2000))
    expect(onLong).toHaveBeenCalledTimes(1)
    Reflect.deleteProperty(navigator, 'vibrate')
  })

  it('does not swallow a later keyboard click when the release never produced one', () => {
    const { h } = setup()
    act(() => h().onPointerDown(down()))
    act(() => void vi.advanceTimersByTime(600))
    act(() => h().onPointerUp()) // released elsewhere: no click
    act(() => void vi.advanceTimersByTime(500))
    const c = click()
    h().onClickCapture(c)
    expect(c.preventDefault).not.toHaveBeenCalled()
  })

  it('cancels when the pointer moves more than 10 px, tolerates small jitter', () => {
    const { onLong, h } = setup()
    act(() => h().onPointerDown(down(100, 100)))
    act(() => h().onPointerMove(move(105, 104)))
    act(() => void vi.advanceTimersByTime(600))
    expect(onLong).toHaveBeenCalledTimes(1)
    act(() => h().onPointerUp())

    onLong.mockClear()
    act(() => h().onPointerDown(down(100, 100)))
    act(() => h().onPointerMove(move(100, 112)))
    act(() => void vi.advanceTimersByTime(600))
    expect(onLong).not.toHaveBeenCalled()
  })

  it('cancels on pointercancel (browser scroll), on scroll and on release', () => {
    const { onLong, h } = setup()
    act(() => h().onPointerDown(down()))
    act(() => h().onPointerCancel())
    act(() => void vi.advanceTimersByTime(600))
    act(() => h().onPointerDown(down()))
    act(() => void vi.advanceTimersByTime(100))
    act(() => void window.dispatchEvent(new Event('scroll')))
    act(() => void vi.advanceTimersByTime(600))
    act(() => h().onPointerDown(down()))
    act(() => void vi.advanceTimersByTime(100))
    act(() => h().onPointerUp())
    act(() => void vi.advanceTimersByTime(600))
    expect(onLong).not.toHaveBeenCalled()
  })

  it('ignores secondary pointers and non-primary mouse buttons, suppresses the context menu', () => {
    const { onLong, h } = setup()
    act(() => h().onPointerDown(down(0, 0, { isPrimary: false })))
    act(() => h().onPointerDown(down(0, 0, { pointerType: 'mouse', button: 2 })))
    act(() => void vi.advanceTimersByTime(600))
    expect(onLong).not.toHaveBeenCalled()
    const e = { preventDefault: vi.fn() } as unknown as MouseEvent
    h().onContextMenu(e)
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('cleans up on unmount', () => {
    const { onLong, h, unmount } = setup()
    act(() => h().onPointerDown(down()))
    unmount()
    act(() => void vi.advanceTimersByTime(600))
    expect(onLong).not.toHaveBeenCalled()
  })
})

import { act } from '@testing-library/react'
import { vi } from 'vitest'
import { DESKTOP_QUERY } from './useDesktopPointer'

type Listener = () => void

/** Installs a controllable matchMedia; returns `set(matches)`. */
export function mockDesktop(initial: boolean) {
  let matches = initial
  const listeners = new Set<Listener>()
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({
      get matches() {
        return q === DESKTOP_QUERY && matches
      },
      media: q,
      addEventListener: (_: string, fn: Listener) => listeners.add(fn),
      removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
    })),
  )
  return (v: boolean) => {
    matches = v
    act(() => listeners.forEach((fn) => fn()))
  }
}

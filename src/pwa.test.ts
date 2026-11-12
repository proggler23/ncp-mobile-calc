import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hasDownloadedAll,
  isDownloadStale,
  markAllDownloaded,
  refreshStaleDownloads,
  watchServiceWorkerUpdates,
} from './pwa'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

const GENS = ['rby', 'sv', 'champions']

describe('offline download upkeep', () => {
  it('does nothing when the user never downloaded everything', async () => {
    const prefetch = vi.fn(() => Promise.resolve())
    await refreshStaleDownloads(GENS, prefetch, true)
    expect(prefetch).not.toHaveBeenCalled()
    expect(hasDownloadedAll()).toBe(false)
  })

  it('marks downloads stale when a new service worker takes over, then refetches online', async () => {
    const listeners: Record<string, () => void> = {}
    vi.stubGlobal('navigator', {
      onLine: true,
      serviceWorker: {
        controller: {},
        addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
      },
    })
    markAllDownloaded()
    watchServiceWorkerUpdates()
    expect(isDownloadStale()).toBe(false)
    listeners.controllerchange?.()
    expect(isDownloadStale()).toBe(true)

    // offline: wait
    const prefetch = vi.fn(() => Promise.resolve())
    await refreshStaleDownloads(GENS, prefetch, false)
    expect(prefetch).not.toHaveBeenCalled()
    expect(isDownloadStale()).toBe(true)

    // online: every generation is fetched again and the flag clears
    await refreshStaleDownloads(GENS, prefetch, true)
    expect(prefetch.mock.calls.map((c) => (c as unknown[])[0])).toEqual(GENS)
    expect(isDownloadStale()).toBe(false)
    expect(hasDownloadedAll()).toBe(true)
  })

  it('stays stale when a download fails so the next start retries', async () => {
    markAllDownloaded()
    localStorage.setItem('ncp:gens-stale', '1')
    const prefetch = vi.fn(() => Promise.reject(new Error('network')))
    await refreshStaleDownloads(GENS, prefetch, true)
    expect(isDownloadStale()).toBe(true)
  })

  it('ignores the very first service worker install', () => {
    const add = vi.fn()
    vi.stubGlobal('navigator', {
      onLine: true,
      serviceWorker: { controller: null, addEventListener: add },
    })
    markAllDownloaded()
    watchServiceWorkerUpdates()
    expect(add).not.toHaveBeenCalled()
  })
})

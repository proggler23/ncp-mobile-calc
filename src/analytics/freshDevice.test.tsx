import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
const flush = () => new Promise((r) => setTimeout(r, 40))
const names = () =>
  fetchMock.mock.calls.map((c) => {
    const q = new URL(String(c[0])).searchParams
    return q.get('p')
  })

/** A fresh module graph (and optionally empty storage), as after loading the page again. */
async function load(emptyStorage: boolean) {
  if (emptyStorage) {
    globalThis.indexedDB = new IDBFactory()
    localStorage.clear()
  }
  vi.resetModules()
  const app = await import('../state/app')
  const share = await import('../state/share')
  const codec = await import('../share/codec')
  const sets = await import('../state/sets')
  return { app, share, codec, sets }
}

async function token(m: Awaited<ReturnType<typeof load>>) {
  await m.app.initApp()
  m.app.setMatchup(
    m.sets.blankSet('champions', 'incineroar'),
    m.sets.blankSet('champions', 'garchomp'),
  )
  return m.codec.encodeShare(m.share.buildSharePayload(m.app.store.get()))
}

beforeEach(() => {
  vi.stubEnv('VITE_GOATCOUNTER_URL', 'https://test.goatcounter.com/count')
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.stubEnv('VITE_GOATCOUNTER_URL', '')
})

describe('share-open-new', () => {
  it('is sent (once) only when the device had no app data before this load', async () => {
    const first = await load(true)
    const tok = await token(first)
    expect(first.app.isFreshDevice()).toBe(true)
    await first.share.openSharedLink(tok)
    await first.share.openSharedLink(tok + '') // same token again: nothing new applied or sent twice
    await flush()
    expect(names().filter((n) => n === 'share-open-new')).toHaveLength(1)
    expect(names()).toContain('share-open')

    // The next page load: the device now has data (and the lang-init marker).
    fetchMock.mockClear()
    const second = await load(false)
    await second.app.initApp()
    expect(second.app.isFreshDevice()).toBe(false)
    await second.share.openSharedLink(tok)
    await flush()
    expect(names()).toEqual(['share-open'])
  })

  it('a second shared link in the same fresh load is share-open only', async () => {
    const m = await load(true)
    const tok = await token(m)
    await m.share.openSharedLink(tok)
    await m.app.setGen('sv')
    await m.share.openSharedLink(tok)
    await flush()
    expect(names().filter((n) => n === 'share-open')).toHaveLength(2)
    expect(names().filter((n) => n === 'share-open-new')).toHaveLength(1)
  })
})

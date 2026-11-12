import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('./sources/data')
  vi.resetModules()
})

describe('runtime loading', () => {
  it('retries after a failed chunk load instead of caching the rejection', async () => {
    vi.resetModules()
    vi.doMock('./sources/data', () => {
      throw new Error('Failed to fetch dynamically imported module (offline)')
    })
    const runtime = await import('./runtime')
    await expect(runtime.loadCore()).rejects.toThrow()
    await expect(runtime.prepare(9)).rejects.toThrow()

    // back online: the same module instance loads the real chunk this time
    vi.doUnmock('./sources/data')
    const rt = await runtime.loadCore()
    expect(rt).toBeDefined()
    await runtime.prepare(9)
    expect(runtime.getRuntime(9)).toBe(rt)
  })

  it('shares one in-flight load between concurrent callers', async () => {
    vi.resetModules()
    const runtime = await import('./runtime')
    const [a, b] = await Promise.all([runtime.loadCore(), runtime.loadCore()])
    expect(a).toBe(b)
  })
})

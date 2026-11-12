import { describe, expect, it } from 'vitest'
import { normalizeBase } from './vite-base'

describe('normalizeBase', () => {
  it('defaults to the root', () => {
    expect(normalizeBase(undefined)).toBe('/')
    expect(normalizeBase('')).toBe('/')
    expect(normalizeBase('/')).toBe('/')
  })
  it('always starts and ends with a slash', () => {
    expect(normalizeBase('repo')).toBe('/repo/')
    expect(normalizeBase('/repo')).toBe('/repo/')
    expect(normalizeBase('repo/')).toBe('/repo/')
    expect(normalizeBase('/repo/')).toBe('/repo/')
  })
  it('keeps absolute URLs but adds the trailing slash', () => {
    expect(normalizeBase('https://example.com/app')).toBe('https://example.com/app/')
  })
})

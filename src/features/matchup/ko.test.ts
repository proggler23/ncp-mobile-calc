import { describe, expect, it } from 'vitest'
import { koLevel } from './ko'

describe('koLevel', () => {
  it('treats OHKO as 1HKO', () => {
    expect(koLevel('guaranteed OHKO')).toBe('ko1')
    expect(koLevel('62.5% chance to OHKO')).toBe('ko1')
    expect(koLevel('18.8% chance to OHKO')).toBe('ko1p')
    expect(koLevel('possible OHKO')).toBe('ko1p')
  })
  it('keeps nHKO', () => {
    expect(koLevel('guaranteed 2HKO')).toBe('ko2')
    expect(koLevel('3HKO')).toBe('ko3')
    expect(koLevel('4HKO')).toBe('none')
    expect(koLevel('')).toBe('none')
  })
})

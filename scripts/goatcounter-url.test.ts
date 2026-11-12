import { describe, expect, it } from 'vitest'
import { normalizeGoatCounterUrl } from './goatcounter-url'

describe('normalizeGoatCounterUrl', () => {
  it.each([undefined, '', '   '])('empty (%j) disables analytics', (v) => {
    expect(normalizeGoatCounterUrl(v)).toBe('')
  })

  it.each([
    ['https://ncpcalc.goatcounter.com/count', 'https://ncpcalc.goatcounter.com/count'],
    ['https://ncpcalc.goatcounter.com', 'https://ncpcalc.goatcounter.com/count'],
    ['https://ncpcalc.goatcounter.com/', 'https://ncpcalc.goatcounter.com/count'],
    ['  https://ncpcalc.goatcounter.com/count/ ', 'https://ncpcalc.goatcounter.com/count'],
    ['https://stats.example.org/count', 'https://stats.example.org/count'],
  ])('accepts %s', (raw, out) => {
    expect(normalizeGoatCounterUrl(raw)).toBe(out)
  })

  it.each([
    'http://ncpcalc.goatcounter.com/count',
    'ncpcalc.goatcounter.com',
    'https://stats.example.org',
    'https://stats.example.org/other',
    'https://evil.com/goatcounter.com/count/x',
    'https://notgoatcounter.com',
    'https://ncpcalc.goatcounter.com/count?x=1',
    'https://ncpcalc.goatcounter.com/count#x',
    'https://user:pw@ncpcalc.goatcounter.com/count',
    'javascript:alert(1)',
  ])('rejects %s', (raw) => {
    expect(() => normalizeGoatCounterUrl(raw)).toThrow(/VITE_GOATCOUNTER_URL/)
  })
})

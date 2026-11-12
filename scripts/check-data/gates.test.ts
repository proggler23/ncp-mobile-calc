// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  compareCounts,
  compareCoverage,
  compareRegulationCounts,
  goldenReasons,
  makeResult,
  mergeResults,
  renderMarkdown,
  statusOf,
  THRESHOLDS,
} from './gates'
import type { CountMap, Coverage } from './gates'

const c = (n: number) => ({ species: n, moves: n, items: n, abilities: n, learnsets: n, sets: n })

describe('compareCounts', () => {
  const prev: CountMap = { sv: c(1000) }
  it('passes when counts are equal or grow', () => {
    expect(compareCounts(prev, { sv: c(1000) }).reasons).toEqual([])
    expect(compareCounts(prev, { sv: c(1200) }).reasons).toEqual([])
  })
  it('allows drops up to and including the 5% threshold', () => {
    expect(compareCounts(prev, { sv: c(950) }).reasons).toEqual([])
  })
  it('flags drops above 5% as anomaly', () => {
    const { reasons } = compareCounts(prev, { sv: { ...c(1000), sets: 940 } })
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatchObject({ level: 'anomaly', code: 'count-drop' })
    expect(reasons[0]!.message).toContain('sets dropped 6.0%')
  })
  it('flags catastrophic drops as fail', () => {
    const { reasons } = compareCounts(prev, { sv: { ...c(1000), species: 400 } })
    expect(reasons[0]).toMatchObject({ level: 'fail' })
  })
  it('ignores empty baselines (e.g. gens without sets) and reports deltas', () => {
    const p: CountMap = { rby: { ...c(10), sets: 0 } }
    const r = compareCounts(p, { rby: { ...c(10), sets: 0 } })
    expect(r.reasons).toEqual([])
    expect(compareCounts(p, { rby: { ...c(12), sets: 0 } }).deltas).toEqual({
      rby: { species: 2, moves: 2, items: 2, abilities: 2, learnsets: 2 },
    })
  })
  it('fails when a generation vanished', () => {
    expect(compareCounts(prev, {}).reasons[0]).toMatchObject({
      level: 'fail',
      code: 'count-gen-missing',
    })
  })
  it('honours custom thresholds', () => {
    const r = compareCounts(prev, { sv: c(990) }, { ...THRESHOLDS, countDropAnomaly: 0.005 })
    expect(r.reasons.length).toBeGreaterThan(0)
  })
})

describe('compareCoverage', () => {
  const base: Coverage = { sv: { moves: { ncpOnly: ['A'], sdOnly: ['B'] } } }
  it('accepts identical or shrinking unmatched lists', () => {
    expect(compareCoverage(base, base)).toEqual([])
    expect(compareCoverage(base, { sv: { moves: { ncpOnly: [], sdOnly: ['B'] } } })).toEqual([])
  })
  it('flags new unmatched entities on either side', () => {
    const r = compareCoverage(base, { sv: { moves: { ncpOnly: ['A', 'C'], sdOnly: ['B', 'D'] } } })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ level: 'anomaly', code: 'bridge-new-unmatched' })
    expect(r[0]!.message).toContain('NCP-only "C"')
    expect(r[0]!.message).toContain('Showdown-only "D"')
  })
  it('treats a new gen/kind as all-new', () => {
    expect(compareCoverage({}, { za: { items: { ncpOnly: ['X'], sdOnly: [] } } })).toHaveLength(1)
  })
})

describe('golden threshold', () => {
  it('is an anomaly above 10% only', () => {
    expect(goldenReasons(0.1)).toEqual([])
    expect(goldenReasons(0.101)[0]).toMatchObject({ level: 'anomaly', code: 'golden-changed' })
  })
})

describe('status aggregation', () => {
  const anomaly = { level: 'anomaly', code: 'x', message: 'm' } as const
  const fail = { level: 'fail', code: 'y', message: 'm' } as const
  it('worst status wins', () => {
    expect(statusOf([])).toBe('pass')
    expect(statusOf([anomaly])).toBe('anomaly')
    expect(statusOf([anomaly, fail])).toBe('fail')
    expect(statusOf([], [{ name: 'lint', status: 'fail' }])).toBe('fail')
  })
  it('merges results and renders markdown', () => {
    const a = makeResult({
      reasons: [],
      notes: ['n1'],
      checks: [{ name: 'schema', status: 'pass' }],
    })
    const b = makeResult({ reasons: [anomaly], notes: [], checks: [] })
    const m = mergeResults([a, b])
    expect(m.status).toBe('anomaly')
    expect(m.notes).toEqual(['n1'])
    const md = renderMarkdown(m)
    expect(md).toContain('ANOMALY')
    expect(md).toContain('`x`')
    expect(JSON.parse(JSON.stringify(m)).status).toBe('anomaly')
  })
})

describe('compareRegulationCounts', () => {
  const prev = { 'champions/regmc': { species: 366, items: 166 } }
  it('passes unchanged, grown and new regulations, and reports deltas', () => {
    expect(compareRegulationCounts(prev, prev).reasons).toEqual([])
    const grown = {
      'champions/regmc': { species: 370, items: 166 },
      'champions/regmd': { species: 1, items: 1 },
    }
    const r = compareRegulationCounts(prev, grown)
    expect(r.reasons).toEqual([])
    expect(r.deltas).toEqual({ 'champions/regmc': { species: 4 } })
  })
  it('flags a drop above 5% as anomaly and 50% as fail', () => {
    const a = compareRegulationCounts(prev, { 'champions/regmc': { species: 340, items: 166 } })
    expect(a.reasons[0]).toMatchObject({ level: 'anomaly', code: 'regulation-count-drop' })
    expect(a.reasons[0]!.message).toContain('species dropped')
    const f = compareRegulationCounts(prev, { 'champions/regmc': { species: 366, items: 80 } })
    expect(f.reasons[0]).toMatchObject({ level: 'fail' })
  })
  it('fails when a regulation disappears', () => {
    expect(compareRegulationCounts(prev, {}).reasons[0]).toMatchObject({
      level: 'fail',
      code: 'regulation-missing',
    })
  })
})

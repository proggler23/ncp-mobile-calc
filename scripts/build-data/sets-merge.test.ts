// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { CommonSet, SetsFile } from '../../src/data/types'
import { ACTIVE_FORMATS, GENS, selectGens } from './config'
import { mergeCurated, stripCurated, validateCurated } from './sets-merge'
import type { CuratedEntry } from './sets-merge'

const zero = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
const gen = (ability: string): CommonSet => ({
  ability,
  item: 'leftovers',
  nature: 'Adamant',
  evs: { ...zero, atk: 252 },
  moves: ['tackle'],
  usagePct: 40,
  source: 'smogon.com/stats chaos',
  format: 'f',
  month: '2026-10',
})
const generated: SetsFile = {
  garchomp: [gen('roughskin'), gen('sandveil')],
  incineroar: [gen('intimidate')],
}
const entry = (mode?: CuratedEntry['mode']): CuratedEntry => ({
  mode,
  sets: [
    {
      ability: 'roughskin',
      item: 'focussash',
      nature: 'Jolly',
      evs: { spe: 252 },
      moves: ['earthquake'],
      teraType: 'Steel',
    },
  ],
})

describe('curated sets merge', () => {
  it('replaces by default and fills defaults', () => {
    const out = mergeCurated(generated, { garchomp: entry() })
    expect(out.garchomp).toHaveLength(1)
    expect(out.garchomp![0]).toMatchObject({
      item: 'focussash',
      source: 'curated',
      usagePct: 0,
      teraType: 'Steel',
      evs: { ...zero, spe: 252 },
    })
    expect(out.incineroar).toEqual(generated.incineroar)
  })
  it('prepends and appends', () => {
    expect(
      mergeCurated(generated, { garchomp: entry('prepend') }).garchomp!.map((s) => s.source),
    ).toEqual(['curated', 'smogon.com/stats chaos', 'smogon.com/stats chaos'])
    expect(mergeCurated(generated, { garchomp: entry('append') }).garchomp!.at(-1)!.source).toBe(
      'curated',
    )
  })
  it('adds species that have no generated sets', () => {
    expect(mergeCurated({}, { garchomp: entry('prepend') }).garchomp).toHaveLength(1)
  })
  it('is idempotent on an already merged snapshot and does not mutate input', () => {
    const once = mergeCurated(generated, { garchomp: entry('prepend') })
    const twice = mergeCurated(once, { garchomp: entry('prepend') })
    expect(twice).toEqual(once)
    expect(generated.garchomp).toHaveLength(2)
    expect(stripCurated(once).garchomp).toHaveLength(2)
  })
  it('validates ids against the gen data', () => {
    const has = {
      species: (id: string) => id === 'garchomp',
      moves: (id: string) => id === 'earthquake',
      items: (id: string) => id === 'focussash',
      abilities: (id: string) => id === 'roughskin',
    }
    expect(validateCurated('sv', { garchomp: entry() }, has)).toEqual([])
    const bad = validateCurated(
      'sv',
      { nope: { sets: [{ ...entry().sets[0]!, moves: ['x'] }] } },
      has,
    )
    expect(bad.join()).toContain('unknown species')
    expect(bad.join()).toContain('unknown move')
  })
})

describe('generation selection (frozen gens)', () => {
  it('defaults to the active formats only', () => {
    expect(selectGens([]).map((g) => g.id)).toEqual(ACTIVE_FORMATS)
    expect(selectGens(['--refresh']).map((g) => g.id)).toEqual(ACTIVE_FORMATS)
  })
  it('--all selects everything, --gen selects named gens', () => {
    expect(selectGens(['--all'])).toHaveLength(GENS.length)
    expect(selectGens(['--gen', 'sv,za']).map((g) => g.id)).toEqual(['sv', 'za'])
  })
  it('rejects unknown gens', () => {
    expect(() => selectGens(['--gen', 'nope'])).toThrow(/unknown/)
  })
  it('keeps only known gens active', () => {
    for (const id of ACTIVE_FORMATS) expect(GENS.some((g) => g.id === id)).toBe(true)
  })
})

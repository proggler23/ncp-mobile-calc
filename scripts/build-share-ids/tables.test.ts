import { describe, expect, it } from 'vitest'
import { GEN_IDS } from '../../src/data/types'
import { currentFor, readTable } from './lib'
import { mergeTable, missingIds, tableChanges, tableErrors, type IdTable } from './tables'

const t = (p: Partial<IdTable>): IdTable => ({
  species: [],
  moves: [],
  items: [],
  abilities: [],
  regulations: [],
  ...p,
})

describe('share-id table logic', () => {
  it('appends new ids and never reorders or removes existing ones', () => {
    const prev = t({ moves: ['b', 'a'] })
    const next = mergeTable(prev, t({ moves: ['a', 'c', 'd'] }))
    expect(next.moves).toEqual(['b', 'a', 'c', 'd']) // "b" left the dex but keeps its number
    expect(tableChanges(prev, next)).toEqual([])
    expect(mergeTable(next, t({ moves: ['a', 'c', 'd'] }))).toEqual(next)
  })

  it('reports changed, moved and removed mappings (additions are fine)', () => {
    const base = t({ species: ['a', 'b', 'c'] })
    expect(tableChanges(base, t({ species: ['a', 'b', 'c', 'd'] }))).toEqual([])
    expect(tableChanges(base, t({ species: ['a', 'c', 'b'] }))[0]).toMatch(/species\[1\]/)
    expect(tableChanges(base, t({ species: ['a', 'b'] }))[0]).toMatch(/missing/)
    expect(tableChanges(undefined, base)).toEqual([])
  })

  it('flags duplicates, bad ids and stale tables', () => {
    expect(tableErrors(t({ items: ['a', 'a'] }))).toContain('items: duplicate ids')
    expect(tableErrors(t({ items: ['A b'] }))).toContain('items: invalid id')
    expect(missingIds(t({ items: ['a'] }), t({ items: ['a', 'b'] }))).toEqual(['items:b'])
  })
})

describe('committed share-id tables', () => {
  // Pinned numbers of old links: these must never change. (Add pins, never edit them.)
  const PINS: [string, keyof IdTable, string, number][] = [
    ['champions', 'species', 'incineroar', 166],
    ['champions', 'moves', 'fakeout', 144],
    ['champions', 'items', 'sitrusberry', 144],
    ['champions', 'abilities', 'intimidate', 85],
    ['champions', 'regulations', 'regmc', 0],
    ['sv', 'species', 'garchomp', 268],
    ['sv', 'moves', 'closecombat', 92],
    ['rby', 'species', 'mew', 81],
    ['rby', 'moves', 'psychic', 97],
  ]
  it('keep the pinned numbers', () => {
    for (const [gen, kind, id, n] of PINS) expect(readTable(gen)?.[kind].indexOf(id)).toBe(n)
  })

  for (const gen of GEN_IDS) {
    it(`${gen}: well formed and covering the current data`, () => {
      const table = readTable(gen)!
      expect(table).toBeTruthy()
      expect(tableErrors(table)).toEqual([])
      expect(missingIds(table, currentFor(gen))).toEqual([])
      // extending with the current data changes nothing: the committed file is up to date
      expect(mergeTable(table, currentFor(gen))).toEqual(table)
    })
  }
})

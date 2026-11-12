// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PopularFile } from '../../src/data/types'
import type { RawGen } from './dex-sources'
import { buildPopular, buildPopularRegulation, natureUsage, topUsage } from './popular'
import type { Chaos, ChosenFormat } from './sets'

const idOf = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, '')
const known = (ids: string[]) => (n: string) => (ids.includes(idOf(n)) ? idOf(n) : undefined)
const MOVES = [
  'fakeout',
  'flareblitz',
  'partingshot',
  'protect',
  'snarl',
  'knockoff',
  'uturn',
  'closecombat',
  'willowisp',
  'throatchop',
  'helpinghand',
  'darkestlariat',
]
const raw = {
  resolve: {
    species: known(['incineroar', 'garchomp']),
    moves: known(MOVES),
    items: known(['sitrusberry', 'rockyhelmet', 'choiceband']),
    abilities: known(['intimidate', 'blaze', 'roughskin']),
  },
} as unknown as RawGen

/** Chaos file of one species with 1000 battlers (weights sum to 1000 per category). */
const chaos = (): Chaos => ({
  info: { metagame: 'x', cutoff: 1760, 'number of battles': 12345 },
  data: {
    Incineroar: {
      Abilities: { Intimidate: 997, Blaze: 3 },
      Items: {
        'Sitrus Berry': 600,
        'Rocky Helmet': 200,
        'Choice Band': 50,
        Nothing: 100,
        Other: 50,
      },
      Moves: {
        'Fake Out': 990,
        'Flare Blitz': 940,
        'Parting Shot': 957,
        Protect: 137,
        'Made Up Move': 500,
        '': 30,
      },
      // champions stat-point spreads: nature prefix + 6 stat points
      Spreads: {
        'Impish:32/0/16/0/18/0': 300,
        'Impish:32/0/32/0/2/0': 8,
        'Careful:32/0/0/0/32/2': 250,
        'Adamant:2/32/0/0/0/32': 240,
        'Quirky:0/0/0/0/0/0': 0,
        'Made:1/1/1/1/1/1': 2,
        Other: 200,
      },
    },
    Garchomp: {
      Abilities: { 'Rough Skin': 10 },
      Items: { 'Choice Band': 10 },
      Moves: {},
      Spreads: {},
    },
    Missingno: { Abilities: { Blaze: 1 }, Items: {}, Moves: {}, Spreads: {} },
  },
})

const chosen = (c = chaos()): ChosenFormat => ({
  format: 'gen9championsvgc2026regmc',
  month: '2026-10',
  cutoff: 1760,
  battles: 12345,
  url: 'u',
  chaos: c,
})

describe('topUsage', () => {
  it('normalises to % of the total, rounds to 1 decimal and sorts descending', () => {
    const r = topUsage({ A: 1, B: 2, C: 0.0004 }, 3, (n) => n.toLowerCase())
    expect(r).toEqual([
      ['b', 66.7],
      ['a', 33.3],
    ])
  })
  it('cuts to the top N after dropping unknown names', () => {
    const map = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`m${i}`, 100 - i]))
    map.zzz = 10_000 // unknown, would be first
    const r = topUsage(map, 1000, (n) => (n === 'zzz' ? undefined : n))
    expect(r).toHaveLength(10)
    expect(r[0]).toEqual(['m0', 10])
    expect(r.at(-1)![0]).toBe('m9')
  })
  it('sums names that resolve to the same id and breaks ties by id', () => {
    const r = topUsage({ 'Fake Out': 5, Fakeout: 5, B: 10, A: 10 }, 100, idOf)
    expect(r).toEqual([
      ['a', 10],
      ['b', 10],
      ['fakeout', 10],
    ])
  })
  it('returns nothing for an empty or zero total and for entries rounding to 0', () => {
    expect(topUsage({ a: 1 }, 0, idOf)).toEqual([])
    expect(topUsage({ a: 1 }, 100000, idOf)).toEqual([])
    expect(topUsage(undefined, 10, idOf)).toEqual([])
  })
})

describe('natureUsage', () => {
  it('aggregates the spreads by nature prefix (stat-point and EV spreads alike)', () => {
    const r = natureUsage(
      {
        'Impish:32/0/16/0/18/0': 300,
        'Impish:32/0/32/0/2/0': 100,
        'Adamant:252/0/0/0/4/252': 100,
        Other: 100,
      },
      (n) => ['Impish', 'Adamant'].includes(n),
    )
    // total includes the unparsable "Other" entry, so shares sum to < 100
    expect(r).toEqual([
      ['Impish', 66.7],
      ['Adamant', 16.7],
    ])
  })
  it('ignores unknown nature names', () => {
    expect(natureUsage({ 'Weird:1/1/1/1/1/1': 5 }, () => false)).toEqual([])
  })
})

describe('buildPopularRegulation', () => {
  const reg = buildPopularRegulation(raw, chosen())
  const inc = reg.species.incineroar!
  it('records the source of the stats', () => {
    expect(reg).toMatchObject({
      format: 'gen9championsvgc2026regmc',
      month: '2026-10',
      cutoff: 1760,
      battles: 12345,
    })
  })
  it('maps names to ids and drops unknown / Other / Nothing / empty entries', () => {
    expect(inc.moves).toEqual([
      ['fakeout', 99],
      ['partingshot', 95.7],
      ['flareblitz', 94],
      ['protect', 13.7],
    ])
    expect(inc.items).toEqual([
      ['sitrusberry', 60],
      ['rockyhelmet', 20],
      ['choiceband', 5],
    ])
    expect(inc.abilities).toEqual([
      ['intimidate', 99.7],
      ['blaze', 0.3],
    ])
  })
  it('aggregates natures from the spreads', () => {
    expect(inc.natures).toEqual([
      ['Impish', 30.8],
      ['Careful', 25],
      ['Adamant', 24],
    ])
  })
  it('drops species that are not in the dex and species without any usable entry', () => {
    expect(Object.keys(reg.species)).toEqual(['garchomp', 'incineroar'])
    expect(reg.species.garchomp).toEqual({
      moves: [],
      items: [['choiceband', 100]],
      abilities: [['roughskin', 100]],
      natures: [],
    })
  })
})

describe('buildPopular', () => {
  const regs = [
    { id: 'regmc', label: { en: 'a', de: 'a' }, usage: { id: 'f-mc', months: ['2026-10'] } },
    { id: 'regmb', label: { en: 'b', de: 'b' }, usage: { id: 'f-mb', months: ['2026-08'] } },
    { id: 'regxx', label: { en: 'x', de: 'x' } }, // no Smogon stats: skipped
  ]
  const previous: PopularFile = {
    source: 'smogon',
    regs: {
      regmb: {
        format: 'old',
        month: '2026-07',
        cutoff: 1760,
        battles: 1,
        species: { a: undefined! },
      },
    },
  }
  it('builds each regulation with usage configured', async () => {
    const r = await buildPopular(raw, regs, undefined, async (f) => ({
      ...chosen(),
      format: f.id,
    }))
    expect(Object.keys(r.file!.regs)).toEqual(['regmc', 'regmb'])
    expect(r.file!.regs.regmb!.format).toBe('f-mb')
    expect(r.kept).toEqual([])
  })
  it('keeps the committed snapshot of a regulation whose download fails or has no stats', async () => {
    const r = await buildPopular(raw, regs, previous, async (f) => {
      if (f.id === 'f-mb') throw new Error('network down')
      return chosen()
    })
    expect(r.file!.regs.regmb).toBe(previous.regs.regmb)
    expect(r.kept).toEqual(['regmb'])
    const none = await buildPopular(raw, regs, previous, async () => null)
    expect(none.kept).toEqual(['regmb'])
    expect(none.missing).toEqual(['regmc'])
    expect(Object.keys(none.file!.regs)).toEqual(['regmb'])
  })
  it('writes no file when nothing is available', async () => {
    const r = await buildPopular(raw, regs, undefined, async () => null)
    expect(r.file).toBeUndefined()
    expect(r.missing).toEqual(['regmc', 'regmb'])
  })
  it('treats stats without any species of the dex as unusable', async () => {
    const empty = chosen({ ...chaos(), data: { Missingno: chaos().data.Missingno! } })
    const r = await buildPopular(raw, regs, undefined, async () => empty)
    expect(r.file).toBeUndefined()
  })
})

describe('committed champions popular.json', () => {
  const file = JSON.parse(
    readFileSync(
      path.resolve(import.meta.dirname, '../../src/data/generated/champions/popular.json'),
      'utf8',
    ),
  ) as PopularFile
  it('has the three regulations from Smogon at cutoff 1760', () => {
    expect(Object.keys(file.regs).sort()).toEqual(['regma', 'regmb', 'regmc'])
    for (const r of Object.values(file.regs)) {
      expect(r.cutoff).toBe(1760)
      expect(r.month).toMatch(/^\d{4}-\d{2}$/)
      expect(Object.keys(r.species).length).toBeGreaterThan(150)
    }
    expect(file.regs.regmc!.format).toBe('gen9championsvgc2026regmc')
  })
  it('lists Fake Out first and Intimidate for Incineroar in Reg M-C', () => {
    const inc = file.regs.regmc!.species.incineroar!
    expect(inc.moves[0]![0]).toBe('fakeout')
    expect(inc.moves[0]![1]).toBeGreaterThan(80)
    expect(inc.abilities[0]![0]).toBe('intimidate')
    expect(inc.moves.length).toBeLessThanOrEqual(10)
    expect(inc.natures.length).toBeGreaterThan(2)
    const total = inc.natures.reduce((a, [, p]) => a + p, 0)
    expect(total).toBeGreaterThan(95)
    expect(total).toBeLessThanOrEqual(100.5)
  })
})

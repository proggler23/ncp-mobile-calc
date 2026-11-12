import { beforeAll, describe, expect, it } from 'vitest'
import { loadGenData } from '../../data'
import type { SpeciesRecord } from '../../data/types'
import { chipLabels, formeBadge, type SpeciesLookup } from './chipLabels'

let lookup: SpeciesLookup
beforeAll(async () => {
  const gens = await Promise.all([loadGenData('sv'), loadGenData('champions'), loadGenData('swsh')])
  const map = new Map<string, SpeciesRecord>()
  for (const r of gens.flatMap((g) => g.species)) map.set(r.id, r)
  lookup = (id) => map.get(id)
})

const run = (ids: string[], lang: 'de' | 'en') =>
  chipLabels(
    ids.map((speciesId) => ({ speciesId })),
    lang,
    lookup,
  )

describe('formeBadge', () => {
  it('maps formes', () => {
    expect(formeBadge('Mega')).toBe('M')
    expect(formeBadge('Mega-X')).toBe('MX')
    expect(formeBadge('Mega-Z')).toBe('MZ')
    expect(formeBadge('Galar-Zen')).toBe('G')
    expect(formeBadge('Paldea-Combat')).toBe('P')
    expect(formeBadge('Wash')).toBe('')
    expect(formeBadge(undefined)).toBe('')
    expect(formeBadge(undefined, true)).toBe('M')
  })
})

describe('chipLabels', () => {
  it('uses the base name and a badge (German)', () => {
    const l = run(
      [
        'charizardmegax',
        'charizardmegay',
        'venusaurmega',
        'garchompmegaz',
        'floettemega',
        'raichualola',
      ],
      'de',
    )
    expect(l.map((x) => x.label)).toEqual(['Glur', 'Glur', 'Bisa', 'Knak', 'Floe', 'Raic'])
    expect(l.map((x) => x.badge)).toEqual(['MX', 'MY', 'M', 'MZ', 'M', 'A'])
    expect(l[0]!.full).toBe('Mega-Glurak X')
  })

  it('handles regional formes', () => {
    const l = run(['darmanitangalarzen', 'arcaninehisui', 'taurospaldeacombat'], 'de')
    expect(l.map((x) => x.badge)).toEqual(['G', 'H', 'P'])
    expect(l[0]!.label).toBe('Flam')
    expect(l[1]!.label).toBe('Arka')
    expect(l[2]!.label).toBe('Taur')
    const en = run(['charizardmegay', 'raichualola'], 'en')
    expect(en.map((x) => x.label)).toEqual(['Char', 'Raic'])
    expect(en.map((x) => x.badge)).toEqual(['MY', 'A'])
  })

  it('leaves normal species alone', () => {
    const l = run(['incineroar', 'garchomp', 'rotom'], 'en')
    expect(l.map((x) => x.label)).toEqual(['Inci', 'Garc', 'Roto'])
    expect(l.every((x) => x.badge === '')).toBe(true)
  })

  it('disambiguates formes of one species', () => {
    for (const lang of ['de', 'en'] as const) {
      for (const ids of [
        ['rotomwash', 'rotomheat'],
        ['ogerponwellspring', 'ogerponhearthflame', 'ogerpon'],
        ['urshifusinglestrike', 'urshifurapidstrike'],
      ]) {
        const l = run(ids, lang)
        expect(new Set(l.map((x) => x.label + x.badge)).size).toBe(ids.length)
        for (const x of l) expect(Array.from(x.label).length).toBeLessThanOrEqual(5)
      }
    }
    expect(run(['rotomwash', 'rotomheat'], 'en').map((x) => x.label)).toEqual(['RotW', 'RotH'])
  })

  it('keeps duplicates of the same species identical', () => {
    const l = run(['rotomwash', 'rotomwash'], 'en')
    expect(l[0]!.label).toBe(l[1]!.label)
  })
})

import { describe, expect, it } from 'vitest'
import { GEN_DATA_IDS } from '../bridge/gens'
import {
  GEN_REGULATIONS,
  genSelectGroups,
  genSelectValue,
  parseGenSelectValue,
} from './genRegulations'

type RegFile = { regulations: { id: string; label: { en: string; de: string } }[] }
const files = import.meta.glob<{ default: RegFile }>('../data/generated/*/regulations.json', {
  eager: true,
})

describe('gen/regulation select options', () => {
  it('mirror the generated regulation data (ids, order, labels)', () => {
    for (const gen of GEN_DATA_IDS) {
      const file = files[`../data/generated/${gen}/regulations.json`]?.default
      const mirrored = GEN_REGULATIONS[gen]
      if (!file || file.regulations.length === 0) {
        expect(mirrored, gen).toBeUndefined()
        continue
      }
      expect(
        mirrored?.map((r) => ({ id: r.id, label: { en: r.en, de: r.de } })),
        gen,
      ).toEqual(file.regulations.map((r) => ({ id: r.id, label: r.label })))
    }
  })

  it('groups regulations per generation with compact, localized labels', () => {
    const en = genSelectGroups('en')
    const champions = en.find((g) => g.label === 'Champions')!
    expect(champions.options.map((o) => o.text)).toEqual([
      'Champions · M-C',
      'Champions · M-B',
      'Champions · M-A',
      'Champions · No filter',
    ])
    expect(champions.options.map((o) => o.value)).toEqual([
      'champions:regmc',
      'champions:regmb',
      'champions:regma',
      'champions:none',
    ])
    expect(
      genSelectGroups('de')
        .find((g) => g.label === 'S/V')!
        .options.at(-1)?.text,
    ).toBe('S/V · Kein Filter')
    expect(en.find((g) => g.label === 'GSC')!.options).toEqual([
      { value: 'gsc', text: 'GSC', gen: 'gsc' },
    ])
  })

  it('values round trip', () => {
    expect(genSelectValue('sv', 'regg')).toBe('sv:regg')
    expect(genSelectValue('gsc', 'none')).toBe('gsc')
    expect(parseGenSelectValue('sv:regg')).toEqual({ gen: 'sv', regulation: 'regg' })
    expect(parseGenSelectValue('gsc')).toEqual({ gen: 'gsc', regulation: undefined })
  })
})

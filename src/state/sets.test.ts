import { beforeAll, describe, expect, it } from 'vitest'
import { GEN_META } from '../bridge/gens'
import type { DataGenId, SavedSetLike } from '../bridge/types'
import { emptySpread } from '../storage/types'
import { NATURE_NAMES } from '../storage/types'
import { getLib, prepareLib } from './lib'
import { NATURES, blankSet, computeStats, sanitizeSet } from './sets'

const GENS: DataGenId[] = ['gsc', 'sv', 'lgpe', 'champions']
beforeAll(async () => {
  for (const g of GENS) await prepareLib(g)
})

function convert(from: DataGenId, to: DataGenId, set: SavedSetLike) {
  return sanitizeSet(GEN_META[from], to, set)
}

describe('investment across generation switches', () => {
  const evs = { hp: 252, atk: 0, def: 4, spa: 0, spd: 0, spe: 252 }

  it('resets IVs to 31 when leaving gen 1-2 (DVs are stored as IV = 2 * DV)', () => {
    const gsc: SavedSetLike = {
      ...blankSet('gsc', 'pikachu'),
      ivs: { hp: 30, atk: 20, def: 10, spa: 6, spd: 6, spe: 30 },
    }
    expect(convert('gsc', 'sv', gsc)?.ivs).toEqual(emptySpread(31))
    expect(convert('gsc', 'lgpe', gsc)?.ivs).toEqual(emptySpread(31))
  })

  it('keeps IVs between generations that use IVs', () => {
    const ivs = { ...emptySpread(31), atk: 0 }
    const sv: SavedSetLike = { ...blankSet('sv', 'pikachu'), ivs }
    expect(convert('sv', 'lgpe', sv)?.ivs).toEqual(ivs)
  })

  it('resets EVs when entering gen 7.5 (an AV is not an EV) and keeps the nature', () => {
    const sv: SavedSetLike = { ...blankSet('sv', 'pikachu'), nature: 'Timid', evs }
    const lgpe = convert('sv', 'lgpe', sv)!
    expect(lgpe.evs).toEqual(emptySpread(0))
    expect(lgpe.nature).toBe('Timid')
  })

  it('resets AVs when leaving gen 7.5', () => {
    const lgpe: SavedSetLike = {
      ...blankSet('lgpe', 'pikachu'),
      nature: 'Modest',
      evs: { ...emptySpread(0), hp: 200, atk: 200, spe: 200 },
    }
    const sv = convert('lgpe', 'sv', lgpe)!
    expect(sv.evs).toEqual(emptySpread(0))
    expect(sv.nature).toBe('Modest')
    expect(convert('lgpe', 'champions', lgpe)!.evs).toEqual(emptySpread(0))
  })

  it('moves between EVs and Champions Stat Points consistently', () => {
    const sv: SavedSetLike = { ...blankSet('sv', 'pikachu'), evs }
    const champ = convert('sv', 'champions', sv)!
    expect(champ.evs).toEqual(emptySpread(0))
    expect(champ.statPoints).toEqual(emptySpread(0))
    const back = convert('champions', 'sv', {
      ...champ,
      statPoints: { ...emptySpread(0), hp: 32 },
    })!
    expect(back.statPoints).toBeUndefined()
    expect(back.evs).toEqual(emptySpread(0))
  })

  it('clears EVs and the nature when entering gen 1-2', () => {
    const sv: SavedSetLike = { ...blankSet('sv', 'pikachu'), nature: 'Timid', evs }
    const gsc = convert('sv', 'gsc', sv)!
    expect(gsc.evs).toEqual(emptySpread(0))
    expect(gsc.nature).toBe('Serious')
  })
})

describe('prototype-safe lookups', () => {
  it('lists the same natures in the schema and in the stat table', () => {
    expect([...NATURE_NAMES].sort()).toEqual(Object.keys(NATURES).sort())
  })

  it('treats inherited keys as unknown (no NaN stats, no throws)', () => {
    const meta = GEN_META.sv
    const base: [number, number, number, number, number, number] = [80, 80, 80, 80, 80, 80]
    const set = { ...blankSet('sv', 'pikachu'), nature: 'constructor' }
    const stats = computeStats(meta, base, set)
    expect(Object.values(stats).every(Number.isFinite)).toBe(true)
    expect(stats).toEqual(computeStats(meta, base, { ...set, nature: 'Serious' }))
  })

  it('does not resolve species / moves / abilities named like Object.prototype members', () => {
    const { bridge } = getLib()
    for (const id of ['constructor', 'valueof', 'hasownproperty']) {
      expect(() => bridge.movesForSpecies('sv', id)).not.toThrow()
      expect(bridge.movesForSpecies('sv', id).learnsetReliable).toBe(false) // unknown: no learnset
    }
    expect(
      bridge.fieldFromAbilities(9, { abilityId: 'constructor' }, { abilityId: 'constructor' }),
    ).toEqual({})
    expect(bridge.typeFromItem('Arceus', undefined, 'constructor')).toBe('Normal')
  })
})

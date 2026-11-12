import { beforeEach, describe, expect, it, vi } from 'vitest'
import { detectLang, translate } from '../i18n'
import {
  initApp,
  pickSpecies,
  resetStore,
  setFormat,
  setGen,
  setLang,
  setMatchup,
  setSideFlag,
  setSpecies,
  store,
  swapSides,
  applyOppPreset,
  setSpikes,
} from './app'
import { getLib } from './lib'
import { filterItems } from '../ui/SearchOverlay'
import { moveItems, speciesItems } from './catalog'
import {
  setInvestment,
  statLimits,
  investmentTotal,
  investmentOf,
  blankSet,
  computeStats,
} from './sets'

beforeEach(async () => {
  localStorage.clear()
  const { getRepository } = await import('../storage')
  await (await getRepository()).setSettings({ gen: 'sv', format: 'doubles', lang: 'en' })
  resetStore()
  await initApp()
})

describe('boot', () => {
  it('becomes ready on the default generation', () => {
    const s = store.get()
    expect(s.status).toBe('ready')
    expect(s.gen).toBe('sv')
    expect(s.format).toBe('doubles')
  })

  it('detects German from navigator.language', () => {
    expect(detectLang({ language: 'de-AT' })).toBe('de')
    expect(detectLang({ language: 'en-GB' })).toBe('en')
    expect(translate('de', 'common.close')).toBe('Schließen')
  })

  it('persists the language', async () => {
    setLang('de')
    expect(store.get().lang).toBe('de')
    await new Promise((r) => setTimeout(r, 50))
    const { getRepository } = await import('../storage')
    expect((await (await getRepository()).getSettings()).lang).toBe('de')
  })
})

describe('presets and selection', () => {
  it('defaults a new opponent to its Common set when available', async () => {
    await pickSpecies('opp', 'incineroar')
    const s = store.get()
    expect(s.opp?.speciesId).toBe('incineroar')
    expect(s.oppPreset).toBe('common')
    expect(s.oppHasCommon).toBe(true)
    expect(s.opp?.moveIds.length).toBeGreaterThan(0)
  })

  it('falls back to Neutral (and disables Common) without a usage set', async () => {
    await setGen('rby')
    await pickSpecies('opp', 'pikachu')
    const s = store.get()
    expect(s.oppHasCommon).toBe(false)
    expect(s.oppPreset).toBe('neutral')
    expect(s.opp?.nature).toBe('Serious')
  })

  it('applies the Def preset to the opponent and keeps its moves', async () => {
    await pickSpecies('opp', 'incineroar')
    const before = store.get().opp!
    await applyOppPreset('physDef')
    const opp = store.get().opp!
    expect(store.get().oppPreset).toBe('physDef')
    expect(opp.nature).toBe('Bold')
    expect(opp.evs).toMatchObject({ hp: 252, def: 252, atk: 0 })
    expect(opp.moveIds).toEqual(before.moveIds)
    await applyOppPreset('common')
    expect(store.get().opp?.nature).toBe(before.nature)
  })

  it('swaps the two Pokemon together with their field sides', async () => {
    await pickSpecies('mine', 'fluttermane')
    await pickSpecies('opp', 'incineroar')
    setSideFlag('opp', 'reflect', true)
    swapSides()
    const s = store.get()
    expect(s.mine?.speciesId).toBe('incineroar')
    expect(s.opp?.speciesId).toBe('fluttermane')
    expect(s.field.mine.reflect).toBe(true)
    expect(s.field.opp.reflect).toBeUndefined()
    expect(s.calc?.result.moves.length).toBe(4)
  })

  it('recalculates when the field changes', async () => {
    await pickSpecies('mine', 'fluttermane')
    await pickSpecies('opp', 'incineroar')
    const base = store.get().calc!.result.moves[0]!.damageText
    setSideFlag('opp', 'reflect', true)
    setSpikes('opp', 2)
    setFormat('singles')
    expect(store.get().calc!.input.field?.format).toBe('Singles')
    expect(store.get().calc!.result.moves[0]!.damageText).toBe(base) // Reflect: physical only
  })
})

describe('generation switch', () => {
  it('keeps compatible selections and drops incompatible ones', async () => {
    setMatchup(
      {
        ...blankSet('sv', 'garchomp'),
        moveIds: ['earthquake', 'protect'],
        teraType: 'Fire',
        itemId: 'choicescarf',
      },
      blankSet('sv', 'koraidon'),
    )
    await setGen('swsh')
    const s = store.get()
    expect(s.gen).toBe('swsh')
    expect(s.mine?.speciesId).toBe('garchomp')
    expect(s.mine?.moveIds).toContain('earthquake')
    expect(s.mine?.teraType).toBeUndefined()
    expect(s.mine?.itemId).toBe('choicescarf')
    expect(s.opp).toBeUndefined() // Koraidon does not exist in SwSh
    expect(s.status).toBe('ready')
  })

  it('switches to singles-only generations', async () => {
    await setGen('za')
    expect(store.get().format).toBe('singles')
    setFormat('doubles')
    expect(store.get().format).toBe('singles')
  })

  it('switches to Champions and uses Stat Points', async () => {
    await pickSpecies('mine', 'garchomp')
    await setGen('champions')
    const mine = store.get().mine!
    expect(mine.statPoints).toBeDefined()
    expect(getLib().bridge.GEN_META.champions.usesStatPoints).toBe(true)
  })
})

describe('search', () => {
  it('finds species by German and English names, diacritic insensitive', () => {
    const items = speciesItems('sv', 'en')
    expect(filterItems(items, 'Fiaro')[0]?.id).toBe('talonflame')
    expect(filterItems(items, 'glurak').map((i) => i.id)).toContain('charizard')
    expect(filterItems(items, 'FUEGRO')[0]?.id).toBe('incineroar')
    expect(filterItems(items, 'flabebe').length).toBeGreaterThan(0)
    const de = speciesItems('sv', 'de').find((i) => i.id === 'talonflame')!
    expect(de.primary).toBe('Fiaro')
    expect(de.secondary).toBe('Talonflame')
  })
})

describe('move picker', () => {
  it('only lists moves the species can learn', () => {
    const { items, reliable } = moveItems('sv', 'fluttermane', 'en')
    const ids = items.map((i) => i.id)
    expect(reliable).toBe(true)
    expect(ids).toContain('moonblast')
    expect(ids).not.toContain('earthquake')
    expect(ids).not.toContain('swordsdance')
    const learnsets = getLib().bridge.getBridge('sv').data.learnsets.fluttermane!
    for (const id of ids) expect(learnsets).toContain(id)
  })

  it('flags unreliable learnsets (Z-A)', () => {
    return setGen('za').then(() => {
      expect(moveItems('za', 'garchomp', 'en').reliable).toBe(false)
    })
  })

  it('drops unlearnable moves when the species changes', async () => {
    setMatchup({ ...blankSet('sv', 'garchomp'), moveIds: ['earthquake', 'protect'] }, undefined)
    setSpecies('mine', 'fluttermane')
    expect(store.get().mine?.moveIds).toEqual(['protect'])
  })
})

describe('stat points', () => {
  it('caps each stat at 32 and the total at 66', async () => {
    await setGen('champions')
    const meta = getLib().bridge.GEN_META.champions
    expect(statLimits(meta)).toMatchObject({ system: 'stat-points', max: 32, total: 66 })
    let set = blankSet('champions', 'garchomp')
    set = setInvestment(meta, set, 'hp', 99)
    expect(investmentOf(meta, set).hp).toBe(32)
    set = setInvestment(meta, set, 'atk', 32)
    set = setInvestment(meta, set, 'spe', 32)
    expect(investmentOf(meta, set).spe).toBe(2) // only 2 points left
    expect(investmentTotal(investmentOf(meta, set))).toBe(66)
    set = setInvestment(meta, set, 'hp', 40) // lowering others is not automatic
    expect(investmentTotal(investmentOf(meta, set))).toBe(66)
    expect(computeStats(meta, [108, 130, 95, 80, 85, 102], set).hp).toBeGreaterThan(0)
  })
})

describe('restoring a matchup the engine cannot calculate', () => {
  it('falls back to a blank matchup and overwrites the stored one', async () => {
    const { getRepository, flushMatchup } = await import('./app')
    await initApp()
    await pickSpecies('mine', 'pikachu')
    await pickSpecies('opp', 'garchomp')
    await flushMatchup()
    const gen = store.get().gen
    resetStore()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const calc = vi.spyOn(getLib().engine, 'calculate').mockImplementation(() => {
      throw new Error('boom')
    })
    try {
      await initApp()
      const s = store.get()
      expect(s.status).toBe('ready')
      expect(s.mine).toBeUndefined()
      expect(s.opp).toBeUndefined()
      expect(s.calcError).toBeUndefined()
      expect(warn).toHaveBeenCalled()
      const stored = await (await getRepository()).getMatchup(gen)
      expect(stored?.mine).toBeUndefined()
      expect(stored?.opp).toBeUndefined()
    } finally {
      calc.mockRestore()
      warn.mockRestore()
    }
  })
})

import { describe, expect, it } from 'vitest'
import { calculate, getGenInfo, type CalcInput, type PokemonInput } from '../engine'
import { emptySpread } from '../storage/types'
import type { CommonSet } from '../data/types'
import {
  GEN_DATA_IDS,
  GEN_MAP,
  GEN_META,
  applyPreset,
  commonSetToSet,
  engineSpeciesList,
  fieldFromAbilities,
  fromCommonSet,
  fromEngineGen,
  getBridge,
  hiddenPowerDvs,
  hiddenPowerIvs,
  hiddenPowerTypeOfDvs,
  hiddenPowerTypeOfIvs,
  HP_TYPE_ORDER,
  movesForSpecies,
  ncpName,
  prepareBridge,
  showdownId,
  speciesDisplayName,
  statusFromItem,
  toEngineGen,
  toEngineInput,
  toEngineInputDetailed,
  typeFromItem,
  type DataGenId,
  type SavedSetLike,
} from './index'

// Top-level await: the golden scenarios below are converted while the tests are collected.
await Promise.all(GEN_DATA_IDS.map((g) => prepareBridge(g)))

describe('gen map', () => {
  it('round-trips string ids and engine ids', () => {
    for (const id of GEN_DATA_IDS) {
      expect(fromEngineGen(toEngineGen(id))).toBe(id)
      expect(GEN_MAP.toEngine[id]).toBe(GEN_META[id].engineGen)
    }
    expect(GEN_DATA_IDS).toHaveLength(12)
  })

  it('agrees with the engine gen info', () => {
    for (const m of Object.values(GEN_META)) {
      const info = getGenInfo(m.engineGen)
      expect(m.hasAbilities).toBe(info.hasAbilities)
      expect(m.hasItems).toBe(info.hasItems)
      expect(m.hasNatDex).toBe(info.hasNatDex)
      expect(m.usesStatPoints).toBe(info.statSystem === 'stat-points')
      expect(m.formats.length === 1).toBe(info.singlesOnly)
    }
    expect(GEN_META.za.formats).toEqual(['singles'])
    expect(GEN_META.lgpe.defaultFormat).toBe('singles')
    expect(GEN_META.sv.hasTera).toBe(true)
    expect(GEN_META.swsh.hasDynamax).toBe(true)
    expect(GEN_META.sm.hasZMoves).toBe(true)
  })
})

describe('name mapping', () => {
  const cases: [DataGenId, string, string][] = [
    ['xy', 'charizardmegax', 'Mega Charizard X'],
    ['champions', 'charizardmegax', 'Mega Charizard X'],
    ['sm', 'charizardmegay', 'Mega Charizard Y'],
    ['sv', 'urshifurapidstrike', 'Urshifu-Rapid Strike'],
    ['sv', 'urshifu', 'Urshifu-Single Strike'],
    ['sv', 'ogerponwellspring', 'Ogerpon-Wellspring'],
    ['sv', 'flabebe', 'Flabebe'],
    ['xy', 'flabebe', 'Flabebe'],
    ['rby', 'nidoranf', 'Nidoran-F'],
    ['gsc', 'nidoranm', 'Nidoran-M'],
    ['xy', 'rotomwash', 'Rotom-Wash'],
    ['sv', 'rotomwash', 'Rotom-Wash'],
    ['sv', 'calyrexshadow', 'Calyrex-Shadow Rider'],
    ['swsh', 'calyrexice', 'Calyrex-Ice Rider'],
    ['sv', 'taurospaldeacombat', 'Tauros-Paldea-Combat'],
    ['sv', 'tapukoko', 'Tapu Koko'],
    ['sm', 'tapulele', 'Tapu Lele'],
    ['rby', 'mrmime', 'Mr. Mime'],
    ['sv', 'greattusk', 'Great Tusk'],
    ['sv', 'tornadus', 'Tornadus'],
  ]
  it.each(cases)('%s species %s <-> %s', (gen, id, ncp) => {
    expect(ncpName(gen, 'species', id)).toBe(ncp)
    expect(showdownId(gen, 'species', ncp)).toBe(id)
  })

  it('maps Farfetch’d (typographic apostrophe in Showdown names)', () => {
    for (const gen of ['rby', 'sv', 'swsh'] as const) {
      const b = getBridge(gen)
      const e = [...b.kinds.species.byNcp.values()].find((x) => /^Farfetch/.test(x[1]))
      expect(e, gen).toBeDefined()
      expect(e?.[1]).toMatch(/^Farfetch.d$/)
      expect(ncpName(gen, 'species', e?.[0] ?? '')).toBe(e?.[1])
      expect(e?.[0]).toBe('farfetchd')
      expect(speciesDisplayName(gen, 'farfetchd', 'en')).toBe('Farfetch’d')
    }
  })

  it('maps moves, items and abilities', () => {
    expect(ncpName('sv', 'moves', 'fakeout')).toBe('Fake Out')
    expect(ncpName('sv', 'moves', 'uturn')).toBe('U-turn')
    expect(ncpName('sv', 'items', 'choicespecs')).toBe('Choice Specs')
    expect(ncpName('sv', 'abilities', 'intimidate')).toBe('Intimidate')
    expect(ncpName('xy', 'items', 'charizarditex')).toBe('Charizardite X')
    expect(ncpName('dpp', 'moves', 'hiddenpowerfire')).toBe('Hidden Power Fire')
    expect(showdownId('dpp', 'moves', 'Hidden Power Fire')).toBe('hiddenpowerfire')
    expect(ncpName('sv', 'abilities', 'asonespectrier')).toBe('As One')
    expect(ncpName('sv', 'abilities', 'asoneglastrier')).toBe('As One')
    expect(ncpName('sm', 'moves', 'breakneckblitz')).toBeDefined()
  })

  it('every primary entry round-trips in every generation', () => {
    for (const gen of GEN_DATA_IDS) {
      const b = getBridge(gen)
      for (const kind of ['species', 'moves', 'items', 'abilities'] as const) {
        for (const [ncp, e] of b.kinds[kind].byNcp) {
          expect(b.kinds[kind].byId.get(e[0])?.[1], `${gen} ${kind} ${ncp}`).toBe(ncp)
        }
      }
    }
  })

  it('Showdown cosmetic formes resolve to their NCP entry', () => {
    expect(ncpName('sv', 'species', 'arceusfire')).toBe('Arceus')
    expect(ncpName('sv', 'species', 'ogerponwellspringtera')).toBe('Ogerpon-Wellspring')
    expect(ncpName('xy', 'species', 'pumpkaboo')).toBe('Pumpkaboo-Average')
    expect(ncpName('swsh', 'species', 'charizardgmax')).toBe('Charizard')
  })

  it('keeps NCP-only entities usable with the NCP name as fallback and no German name', () => {
    const b = getBridge('swsh')
    const ncpOnly = b.map.moves.find((e) => e[1] === 'G-Max Wildfire')
    expect(ncpOnly).toBeDefined()
    expect(ncpName('swsh', 'moves', 'gmaxwildfire')).toBe('G-Max Wildfire')
    const row = engineSpeciesList('swsh').find((s) => s.ncpOnly)
    expect(row).toBeDefined()
    expect(row?.deMissing).toBe(true)
    expect(row?.de).toBe(row?.en)
  })

  it('has high NCP coverage in every generation', () => {
    for (const gen of GEN_DATA_IDS) {
      const species = getBridge(gen).map.species.filter((e) => (e[2] & 1) === 0)
      const unmatched = species.filter((e) => (e[2] & 2) !== 0).length
      expect(unmatched / species.length, gen).toBeLessThan(0.01)
    }
  })
})

describe('display names and pickers', () => {
  it('speciesDisplayName in en/de', () => {
    expect(speciesDisplayName('sv', 'flabebe', 'en').normalize('NFC')).toBe('Flabébé')
    expect(speciesDisplayName('sv', 'flabebe', 'de').normalize('NFC')).toBe('Flabébé')
    expect(speciesDisplayName('sv', 'incineroar', 'en')).toBe('Incineroar')
    expect(speciesDisplayName('sv', 'incineroar', 'de')).toBe('Fuegro')
    expect(speciesDisplayName('xy', 'charizardmegax', 'en')).toBe('Charizard-Mega-X')
    expect(speciesDisplayName('sv', 'nonexistent', 'en')).toBe('nonexistent')
  })

  it('engineSpeciesList lists engine species with search keys', () => {
    const list = engineSpeciesList('sv', { includeNatDexOnly: false })
    const inc = list.find((s) => s.id === 'incineroar')
    expect(inc?.ncpName).toBe('Incineroar')
    expect(inc?.search).toContain('fuegro')
    expect(inc?.natDexOnly).toBe(false)
    expect(list.some((s) => s.natDexOnly)).toBe(false)
    expect(engineSpeciesList('sv').some((s) => s.natDexOnly)).toBe(true)
    // aliases/gmax are not separate picker rows
    expect(list.some((s) => s.id === 'arceusfire')).toBe(false)
  })

  it('movesForSpecies intersects learnsets with engine moves', () => {
    const sv = movesForSpecies('sv', 'incineroar')
    expect(sv.learnsetReliable).toBe(true)
    expect(sv.moveIds).toContain('fakeout')
    expect(sv.moveIds).toContain('flareblitz')
    expect(sv.moveIds).not.toContain('spore')
    const known = new Set(getBridge('sv').map.moves.map((e) => e[0]))
    expect(sv.moveIds.every((m) => known.has(m))).toBe(true)
  })

  it('movesForSpecies falls back to the NCP move list for Z-A', () => {
    const za = movesForSpecies('za', 'incineroar')
    expect(za.learnsetReliable).toBe(false)
    expect(za.moveIds.length).toBeGreaterThan(200)
    expect(new Set(za.moveIds).size).toBe(za.moveIds.length)
  })

  it('movesForSpecies adds typed Hidden Power for old gens', () => {
    const m = movesForSpecies('dpp', 'garchomp')
    expect(m.moveIds).toContain('hiddenpowerfire')
  })
})

describe('auto helpers', () => {
  it('weather from abilities', () => {
    expect(fieldFromAbilities(9, { abilityId: 'drought' }, {})).toEqual({ weather: 'Sun' })
    expect(fieldFromAbilities(9, {}, { abilityId: 'drizzle' })).toEqual({ weather: 'Rain' })
    expect(fieldFromAbilities(9, { abilityId: 'sandstream' }, {})).toEqual({ weather: 'Sand' })
    expect(fieldFromAbilities(8, { abilityId: 'snowwarning' }, {})).toEqual({ weather: 'Hail' })
    expect(fieldFromAbilities(9, { abilityId: 'snowwarning' }, {})).toEqual({ weather: 'Snow' })
    expect(fieldFromAbilities(9, { abilityId: 'orichalcumpulse' }, {})).toEqual({ weather: 'Sun' })
    expect(fieldFromAbilities(7, { abilityId: 'desolateland' }, {})).toEqual({
      weather: 'Harsh Sun',
    })
    expect(fieldFromAbilities(7, { abilityId: 'primordialsea' }, {})).toEqual({
      weather: 'Heavy Rain',
    })
    expect(fieldFromAbilities(7, { abilityId: 'deltastream' }, {})).toEqual({
      weather: 'Strong Winds',
    })
    expect(fieldFromAbilities(9, { abilityId: 'sandspit' }, {})).toEqual({})
    expect(fieldFromAbilities(9, { abilityId: 'sandspit', abilityOn: true }, {})).toEqual({
      weather: 'Sand',
    })
  })

  it('weather conflicts: primal wins, else priority side', () => {
    const a = { abilityId: 'drought' }
    const d = { abilityId: 'drizzle' }
    expect(fieldFromAbilities(9, a, d).weather).toBe('Rain')
    expect(fieldFromAbilities(9, a, d, 'attacker').weather).toBe('Sun')
    expect(fieldFromAbilities(9, { abilityId: 'desolateland' }, d).weather).toBe('Harsh Sun')
    expect(fieldFromAbilities(9, a, { abilityId: 'primordialsea' }, 'attacker').weather).toBe(
      'Heavy Rain',
    )
  })

  it('terrain from abilities', () => {
    expect(fieldFromAbilities(9, { abilityId: 'electricsurge' }, {})).toEqual({
      terrain: 'Electric',
    })
    expect(fieldFromAbilities(9, {}, { abilityId: 'grassysurge' })).toEqual({ terrain: 'Grassy' })
    expect(fieldFromAbilities(9, { abilityId: 'mistysurge' }, {})).toEqual({ terrain: 'Misty' })
    expect(fieldFromAbilities(9, { abilityId: 'psychicsurge' }, {})).toEqual({
      terrain: 'Psychic',
    })
    expect(fieldFromAbilities(9, { abilityId: 'hadronengine' }, {})).toEqual({
      terrain: 'Electric',
    })
    expect(fieldFromAbilities(9, { abilityId: 'seedsower', abilityOn: true }, {})).toEqual({
      terrain: 'Grassy',
    })
    expect(fieldFromAbilities(9, { abilityId: 'teraformzero' }, { abilityId: 'drought' })).toEqual({
      weather: '',
      terrain: '',
    })
  })

  it('Flame Orb / Toxic Orb status and Arceus / Silvally types', () => {
    expect(statusFromItem('flameorb')).toBe('Burned')
    expect(statusFromItem('toxicorb')).toBe('Badly Poisoned')
    expect(statusFromItem('leftovers')).toBeUndefined()
    expect(typeFromItem('Arceus', 'multitype', 'flameplate')).toBe('Fire')
    expect(typeFromItem('Arceus', undefined, 'pixieplate')).toBe('Fairy')
    expect(typeFromItem('Arceus', undefined, 'firiumz')).toBe('Fire')
    expect(typeFromItem('Arceus', undefined, 'leftovers')).toBe('Normal')
    expect(typeFromItem('Silvally', 'rkssystem', 'waterMemory'.toLowerCase())).toBe('Water')
    expect(typeFromItem('Silvally', undefined, 'leftovers')).toBe('Normal')
    expect(typeFromItem('Incineroar', undefined, 'flameplate')).toBeUndefined()
  })

  it('Hidden Power IVs/DVs produce their type', () => {
    for (const t of HP_TYPE_ORDER) {
      const ivs = hiddenPowerIvs(t)
      expect(hiddenPowerTypeOfIvs(ivs)).toBe(t)
      expect(Object.values(ivs).every((v) => v === 30 || v === 31)).toBe(true)
      const dv = hiddenPowerDvs(t)
      expect(hiddenPowerTypeOfDvs(dv.atk, dv.def)).toBe(t)
      expect(dv.atk).toBeLessThanOrEqual(15)
    }
    expect(hiddenPowerIvs('Fire')).toEqual({ hp: 31, atk: 30, def: 31, spa: 30, spd: 31, spe: 30 })
  })
})

function set(
  over: Partial<SavedSetLike> & Pick<SavedSetLike, 'speciesId' | 'moveIds'>,
): SavedSetLike {
  return over
}

describe('toEngineInput', () => {
  it('maps ids, stats and defaults', () => {
    const input = toEngineInput(
      'sv',
      set({
        speciesId: 'fluttermane',
        abilityId: 'protosynthesis',
        itemId: 'choicespecs',
        nature: 'Timid',
        evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
        ivs: emptySpread(31),
        teraType: 'Fairy',
        moveIds: ['moonblast', 'shadowball'],
      }),
      set({ speciesId: 'incineroar', moveIds: ['fakeout'] }),
    )
    expect(input.gen).toBe(9)
    expect(input.natDex).toBeUndefined()
    expect(input.attacker).toMatchObject({
      species: 'Flutter Mane',
      ability: 'Protosynthesis',
      item: 'Choice Specs',
      nature: 'Timid',
      level: 50,
      evs: { hp: 4, at: 0, df: 0, sa: 252, sd: 0, sp: 252 },
      teraType: 'Fairy',
      moves: ['Moonblast', 'Shadow Ball'],
    })
    expect(input.field?.format).toBe('Doubles')
  })

  it('uses Stat Points in Champions and ignores evs/level', () => {
    const input = toEngineInput(
      'champions',
      set({
        speciesId: 'garchomp',
        evs: emptySpread(0),
        statPoints: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
        moveIds: ['earthquake'],
      }),
      set({ speciesId: 'incineroar', moveIds: [] }),
    )
    expect(input.gen).toBe(10)
    expect(input.attacker.statPoints).toEqual({ hp: 2, at: 32, df: 0, sa: 0, sd: 0, sp: 32 })
    expect(input.attacker.evs).toBeUndefined()
    expect(input.attacker.level).toBeUndefined()
  })

  it('gens 1-2 use DVs, LGPE uses AVs, Z-A is singles', () => {
    const rby = toEngineInput(
      'rby',
      set({ speciesId: 'tauros', ivs: emptySpread(31), moveIds: ['bodyslam'] }),
      set({ speciesId: 'chansey', moveIds: [] }),
    )
    expect(rby.attacker.dvs).toMatchObject({ at: 15, sl: 15 })
    expect(rby.attacker.nature).toBeUndefined()
    const lgpe = toEngineInput(
      'lgpe',
      set({ speciesId: 'pikachu', evs: { ...emptySpread(0), spa: 252 }, moveIds: ['thunderbolt'] }),
      set({ speciesId: 'gyarados', moveIds: [] }),
    )
    expect(lgpe.attacker.avs?.sa).toBe(200)
    expect(lgpe.field?.format).toBe('Singles')
    const za = toEngineInput(
      'za',
      set({ speciesId: 'lucario', moveIds: [] }),
      set({ speciesId: 'garchomp', moveIds: [] }),
    )
    expect(za.field?.format).toBe('Singles')
    expect(za.attacker.ability).toBeUndefined()
  })

  it('throws for unknown species, warns and drops unknown moves', () => {
    expect(() =>
      toEngineInput(
        'sv',
        set({ speciesId: 'missingno', moveIds: [] }),
        set({ speciesId: 'incineroar', moveIds: [] }),
      ),
    ).toThrow(/missingno/)
    const r = toEngineInputDetailed(
      'sv',
      set({ speciesId: 'incineroar', moveIds: ['fakeout', 'notamove'], itemId: 'bogus' }),
      set({ speciesId: 'incineroar', moveIds: [] }),
    )
    expect(r.warnings).toHaveLength(2)
    expect(r.input.attacker.moves).toEqual(['Fake Out'])
  })

  it('natDex is auto: only when something is National Dex-only', () => {
    const plain = toEngineInputDetailed(
      'sv',
      set({ speciesId: 'incineroar', moveIds: ['fakeout'] }),
      set({ speciesId: 'garchomp', moveIds: [] }),
    )
    expect(plain.natDex).toBe(false)
    const mega = toEngineInputDetailed(
      'sv',
      set({ speciesId: 'charizardmegax', moveIds: ['flareblitz'] }),
      set({ speciesId: 'garchomp', moveIds: [] }),
    )
    expect(mega.natDex).toBe(true)
    expect(mega.input.natDex).toBe(true)
    expect(mega.input.attacker.species).toBe('Mega Charizard X')
    const forced = toEngineInputDetailed(
      'sv',
      set({ speciesId: 'incineroar', moveIds: [] }),
      set({ speciesId: 'garchomp', moveIds: [] }),
      {},
      { natDex: true },
    )
    expect(forced.natDex).toBe(true)
    expect(
      toEngineInput(
        'dpp',
        set({ speciesId: 'garchomp', moveIds: [] }),
        set({ speciesId: 'heatran', moveIds: [] }),
        {},
        { natDex: true },
      ).natDex,
    ).toBeUndefined()
  })

  it('applies ability-driven weather/terrain unless the field is explicit', () => {
    const a = set({ speciesId: 'torkoal', abilityId: 'drought', moveIds: ['eruption'] })
    const d = set({ speciesId: 'incineroar', abilityId: 'intimidate', moveIds: [] })
    expect(toEngineInput('sv', a, d).field?.weather).toBe('Sun')
    expect(toEngineInput('sv', a, d, { weather: '' }).field?.weather).toBe('')
    expect(toEngineInput('sv', a, d, {}, { autoField: false }).field?.weather).toBeUndefined()
    const t = set({ speciesId: 'rillaboom', abilityId: 'grassysurge', moveIds: [] })
    expect(toEngineInput('sv', t, d).field?.terrain).toBe('Grassy')
  })

  it('applies Orb statuses and Arceus/Silvally types', () => {
    const r = toEngineInput(
      'sv',
      set({ speciesId: 'conkeldurr', abilityId: 'guts', itemId: 'flameorb', moveIds: [] }),
      set({ speciesId: 'arceus', abilityId: 'multitype', itemId: 'flameplate', moveIds: [] }),
    )
    expect(r.attacker.status).toBe('Burned')
    expect(r.defender.types).toEqual(['Fire'])
    const form = toEngineInput(
      'sv',
      set({ speciesId: 'arceusghost', itemId: 'spookyplate', moveIds: [] }),
      set({ speciesId: 'arceuswater', moveIds: [] }),
    )
    expect(form.attacker.species).toBe('Arceus')
    expect(form.attacker.types).toEqual(['Ghost'])
    expect(form.defender.types).toEqual(['Water'])
  })

  it('rewrites Hidden Power IVs in gens 2-6 only', () => {
    const base = set({
      speciesId: 'garchomp',
      ivs: emptySpread(31),
      moveIds: ['hiddenpowerfire'],
    })
    const dpp = toEngineInput('dpp', base, set({ speciesId: 'heatran', moveIds: [] }))
    expect(dpp.attacker.ivs).toEqual({ hp: 31, at: 30, df: 31, sa: 30, sd: 31, sp: 30 })
    const off = toEngineInput(
      'dpp',
      base,
      set({ speciesId: 'heatran', moveIds: [] }),
      {},
      { autoHiddenPower: false },
    )
    expect(off.attacker.ivs?.at).toBe(31)
    const gsc = toEngineInput(
      'gsc',
      { ...base, speciesId: 'tyranitar' },
      set({ speciesId: 'tyranitar', moveIds: [] }),
    )
    expect(hiddenPowerTypeOfDvs(gsc.attacker.dvs?.at ?? 15, gsc.attacker.dvs?.df ?? 15)).toBe(
      'Fire',
    )
  })

  it('handles Gigantamax species ids', () => {
    const r = toEngineInput(
      'swsh',
      set({ speciesId: 'charizardgmax', moveIds: ['fireblast'] }),
      set({ speciesId: 'incineroar', moveIds: [] }),
    )
    expect(r.attacker.species).toBe('Charizard')
    expect(r.attacker.gmax).toBe(true)
    expect(r.attacker.dynamax).toBe(true)
  })
})

describe('fromCommonSet', () => {
  const cs: CommonSet = {
    ability: 'intimidate',
    item: 'sitrusberry',
    nature: 'Adamant',
    evs: { hp: 32, atk: 14, def: 10, spa: 0, spd: 10, spe: 0 },
    moves: ['fakeout', 'flareblitz'],
    usagePct: 8,
    source: 'x',
    format: 'y',
    month: '2026-10',
  }
  it('moves Champions evs into statPoints', () => {
    const b = fromCommonSet('champions', cs)
    expect(b.statPoints).toEqual(cs.evs)
    expect(b.evs).toEqual(emptySpread(0))
    expect(b.abilityId).toBe('intimidate')
    expect(b.moveIds).toEqual(['fakeout', 'flareblitz'])
  })
  it('keeps evs in other gens', () => {
    const b = fromCommonSet('sv', { ...cs, evs: { ...cs.evs, hp: 252 }, teraType: 'Grass' })
    expect(b.statPoints).toBeUndefined()
    expect(b.evs.hp).toBe(252)
    expect(b.teraType).toBe('Grass')
    expect(commonSetToSet('sv', 'incineroar', cs).speciesId).toBe('incineroar')
  })
})

describe('presets', () => {
  const s = set({ speciesId: 'incineroar', moveIds: ['fakeout'], abilityId: 'intimidate' })
  it('sv presets', () => {
    expect(applyPreset('sv', s, 'neutral')).toMatchObject({
      nature: 'Serious',
      evs: emptySpread(0),
    })
    expect(applyPreset('sv', s, 'physDef')).toMatchObject({
      nature: 'Bold',
      evs: { ...emptySpread(0), hp: 252, def: 252 },
    })
    expect(applyPreset('sv', s, 'specDef')).toMatchObject({
      nature: 'Calm',
      evs: { ...emptySpread(0), hp: 252, spd: 252 },
    })
    expect(applyPreset('sv', s, 'physAtk')).toMatchObject({
      nature: 'Adamant',
      evs: { ...emptySpread(0), atk: 252, spe: 252 },
    })
    expect(applyPreset('sv', s, 'specAtk')).toMatchObject({
      nature: 'Modest',
      evs: { ...emptySpread(0), spa: 252, spe: 252 },
    })
    expect(applyPreset('sv', s, 'physDef').abilityId).toBe('intimidate')
  })
  it('champions presets use statPoints', () => {
    const p = applyPreset('champions', s, 'physDef')
    expect(p.statPoints).toEqual({ ...emptySpread(0), hp: 32, def: 32 })
    expect(p.evs).toEqual(emptySpread(0))
    expect(p.nature).toBe('Bold')
    expect(applyPreset('champions', s, 'neutral').statPoints).toEqual(emptySpread(0))
  })
  it('sv preset removes stale statPoints; lgpe caps at 200; gens 1-2 max everything', () => {
    expect(
      applyPreset('sv', { ...s, statPoints: emptySpread(1) }, 'physAtk').statPoints,
    ).toBeUndefined()
    expect(applyPreset('lgpe', s, 'specAtk').evs?.spa).toBe(200)
    const g1 = applyPreset('rby', s, 'physDef')
    expect(g1.evs).toEqual(emptySpread(252))
    expect(g1.nature).toBe('Serious')
  })
  it('common preset uses the top set or returns undefined', () => {
    const cs: CommonSet = {
      ability: 'intimidate',
      item: 'assaultvest',
      nature: 'Careful',
      evs: { hp: 252, atk: 4, def: 12, spa: 0, spd: 164, spe: 76 },
      moves: ['fakeout'],
      usagePct: 10,
      source: 's',
      format: 'f',
      month: 'm',
    }
    expect(applyPreset('sv', s, 'common', undefined)).toBeUndefined()
    expect(applyPreset('sv', s, 'common', [])).toBeUndefined()
    const p = applyPreset('sv', s, 'common', [cs])
    expect(p?.itemId).toBe('assaultvest')
    expect(p?.speciesId).toBe('incineroar')
    expect(p?.evs?.spd).toBe(164)
  })
})

// ---------------------------------------------------------------------------------------------
// End-to-end against the golden scenarios
// ---------------------------------------------------------------------------------------------

interface ExpectedMove {
  damage: number[] | number[][]
  description: string
  damageText: string
  koChanceText: string
  hits: number
}
interface Scenario {
  id: string
  input: CalcInput
  expected: { moves: ExpectedMove[]; reverseMoves: ExpectedMove[] }
}
const goldenFiles = import.meta.glob<{ gen: number; scenarios: Scenario[] }>(
  '../engine/__golden__/gen-*.json',
  { eager: true, import: 'default' },
)
const golden = (gen: number) =>
  Object.values(goldenFiles).find((f) => f.gen === gen)?.scenarios ?? []

const SUPPORTED_POKE_KEYS = new Set([
  'species',
  'level',
  'nature',
  'ability',
  'item',
  'evs',
  'ivs',
  'dvs',
  'statPoints',
  'avs',
  'friendship',
  'teraType',
  'moves',
])
const KEYS = { hp: 'hp', at: 'atk', df: 'def', sa: 'spa', sd: 'spd', sp: 'spe' } as const

function spreadFromEngine(
  m: Record<string, number> | undefined,
  fill: number,
): ReturnType<typeof emptySpread> {
  const out = emptySpread(fill)
  for (const [k, v] of Object.entries(m ?? {})) out[KEYS[k as keyof typeof KEYS]] = v
  return out
}

/** Reverse of toEngineInput for the supported subset; undefined when the scenario uses more. */
function toSavedSet(gen: DataGenId, p: PokemonInput): SavedSetLike | undefined {
  if (Object.keys(p).some((k) => !SUPPORTED_POKE_KEYS.has(k))) return undefined
  if (p.moves.some((m) => typeof m !== 'string')) return undefined
  if (p.dvs || p.avs || p.friendship !== undefined) return undefined
  const id = (kind: 'species' | 'moves' | 'items' | 'abilities', n: string | undefined) =>
    n === undefined ? undefined : showdownId(gen, kind, n)
  const out: SavedSetLike = {
    speciesId: id('species', p.species) ?? '',
    moveIds: p.moves.map((m) => id('moves', m as string) ?? ''),
  }
  if (p.level !== undefined) out.level = p.level
  if (p.nature) out.nature = p.nature
  if (p.ability) out.abilityId = id('abilities', p.ability) ?? ''
  if (p.item) out.itemId = id('items', p.item) ?? ''
  if (p.teraType) out.teraType = p.teraType
  if (p.statPoints) {
    out.statPoints = spreadFromEngine(p.statPoints as Record<string, number>, 0)
    out.evs = emptySpread(0)
  } else {
    out.evs = spreadFromEngine(p.evs as Record<string, number> | undefined, 0)
    out.ivs = spreadFromEngine(p.ivs as Record<string, number> | undefined, 31)
  }
  return out
}

describe.each([
  ['sv', 9],
  ['champions', 10],
  ['swsh', 8],
  ['dpp', 4],
] as const)('end-to-end %s: SavedSet -> toEngineInput -> calculate == golden', (gen, engineGen) => {
  const scenarios = golden(engineGen)
    .map((sc) => ({
      sc,
      a: toSavedSet(gen, sc.input.attacker),
      d: toSavedSet(gen, sc.input.defender),
    }))
    .filter((x) => x.a && x.d)

  it('has convertible scenarios', () => {
    expect(scenarios.length).toBeGreaterThan(0)
  })

  it.each(scenarios.map((x) => [x.sc.id, x] as const))('%s', (_id, { sc, a, d }) => {
    const input = toEngineInput(gen, a as SavedSetLike, d as SavedSetLike, sc.input.field, {
      autoField: false,
      autoStatus: false,
      autoTypes: false,
      autoHiddenPower: false,
      natDex: sc.input.natDex ?? false,
      ...(sc.input.vgcLevels !== undefined ? { vgcLevels: sc.input.vgcLevels } : {}),
      ...(sc.input.resultDisplay !== undefined ? { resultDisplay: sc.input.resultDisplay } : {}),
    })
    expect(input.attacker.species).toBe(sc.input.attacker.species)
    const result = calculate(input)
    const pick = (m: (typeof result.moves)[number]): ExpectedMove => ({
      damage: m.damage,
      description: m.description,
      damageText: m.damageText,
      koChanceText: m.koChance,
      hits: m.hits,
    })
    expect(result.moves.map(pick)).toEqual(sc.expected.moves)
    expect(result.reverseMoves.map(pick)).toEqual(sc.expected.reverseMoves)
  })
})

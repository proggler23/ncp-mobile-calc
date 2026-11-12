import { beforeAll, describe, expect, it } from 'vitest'
import { loadGenData } from '../data'
import type { GenData } from '../data'
import { exportPaste, importPaste } from './showdown'

const TEAM = `Incineroar @ Safety Goggles
Ability: Intimidate
Level: 50
Tera Type: Ghost
EVs: 252 HP / 4 Atk / 100 Def / 4 SpD / 148 Spe
Careful Nature
- Fake Out
- Flare Blitz
- Knock Off
- Parting Shot

Flutter Mane @ Booster Energy
Ability: Protosynthesis
Level: 50
Tera Type: Fairy
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Moonblast
- Shadow Ball
- Dazzling Gleam
- Protect

Rillaboom (M) @ Assault Vest
Ability: Grassy Surge
Level: 50
Tera Type: Fire
EVs: 236 HP / 156 Atk / 4 Def / 76 SpD / 36 Spe
Adamant Nature
- Fake Out
- Grassy Glide
- Wood Hammer
- High Horsepower

Urshifu-Rapid-Strike @ Mystic Water
Ability: Unseen Fist
Level: 50
Tera Type: Water
EVs: 4 HP / 252 Atk / 252 Spe
Jolly Nature
- Surging Strikes
- Close Combat
- Aqua Jet
- Protect

Amoonguss @ Rocky Helmet
Ability: Regenerator
Level: 50
Tera Type: Water
EVs: 252 HP / 100 Def / 156 SpD
Relaxed Nature
IVs: 0 Atk / 0 Spe
- Spore
- Rage Powder
- Pollen Puff
- Protect

Thunder Cat (Tornadus) @ Focus Sash
Ability: Prankster
Level: 50
Tera Type: Flying
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
- Bleakwind Storm
- Tailwind
- Taunt
- Protect
`

let sv: GenData
let champions: GenData
beforeAll(async () => {
  sv = await loadGenData('sv')
  champions = await loadGenData('champions')
})

describe('importPaste (sv)', () => {
  it('parses a realistic 6-mon VGC team', () => {
    const { members, warnings } = importPaste(TEAM, 'sv', sv)
    expect(warnings).toEqual([])
    expect(members.map((m) => m.speciesId)).toEqual([
      'incineroar',
      'fluttermane',
      'rillaboom',
      'urshifurapidstrike',
      'amoonguss',
      'tornadus',
    ])
    const [inc, fm, ril, , amo, torn] = members
    expect(inc).toMatchObject({
      itemId: 'safetygoggles',
      abilityId: 'intimidate',
      level: 50,
      teraType: 'Ghost',
      nature: 'Careful',
      moveIds: ['fakeout', 'flareblitz', 'knockoff', 'partingshot'],
      evs: { hp: 252, atk: 4, def: 100, spa: 0, spd: 4, spe: 148 },
    })
    expect(inc?.statPoints).toBeUndefined()
    expect(fm?.ivs.atk).toBe(0)
    expect(ril?.gender).toBe('M')
    expect(amo?.ivs).toMatchObject({ atk: 0, spe: 0, hp: 31 })
    expect(torn?.nickname).toBe('Thunder Cat')
  })

  it('tolerates German names', () => {
    const paste = `Flatterhaar @ Energiekapsel
Ability: Paläosynthese
Timid Nature
- Mondgewalt
- Schutzschild`
    const { members, warnings } = importPaste(paste, 'sv', sv)
    expect(warnings).toEqual([])
    expect(members[0]).toMatchObject({
      speciesId: 'fluttermane',
      abilityId: 'protosynthesis',
      moveIds: ['moonblast', 'protect'],
    })
  })

  it('warns instead of crashing on unknown entries', () => {
    const paste = `Missingno @ Nonsense Berry
- Splash

Incineroar @ Fake Item
Ability: Fake Ability
Bogus Nature
Level: 500
Tera Type: Shadow
EVs: 300 HP
- Fake Out
- Not A Move
Weird Line`
    const { members, warnings } = importPaste(paste, 'sv', sv)
    expect(members).toHaveLength(1)
    expect(members[0]?.moveIds).toEqual(['fakeout'])
    const w = warnings.join('\n')
    for (const frag of [
      'unknown species',
      'unknown item',
      'unknown ability',
      'unknown nature',
      'invalid level',
      'unknown Tera type',
      'unknown move',
      'exceeds 252',
      'ignored line',
    ])
      expect(w).toContain(frag)
  })

  it('caps members and paste size', () => {
    const one = 'Rillaboom\n- Protect\n\n'
    expect(importPaste(one.repeat(8), 'sv', sv).members).toHaveLength(6)
    const big = importPaste('x'.repeat(60 * 1024), 'sv', sv)
    expect(big.members).toEqual([])
    expect(big.warnings[0]).toMatch(/larger/)
    expect(importPaste('', 'sv', sv).warnings).toHaveLength(1)
  })

  it('round-trips through export', () => {
    const first = importPaste(TEAM, 'sv', sv).members
    const text = exportPaste(first, sv)
    expect(text).toContain('Thunder Cat (Tornadus) @ Focus Sash')
    expect(text).toContain('Urshifu-Rapid-Strike @ Mystic Water')
    expect(text).toContain('Rillaboom (M) @ Assault Vest')
    const second = importPaste(text, 'sv', sv)
    expect(second.warnings).toEqual([])
    const strip = (ms: typeof first) => ms.map((m) => ({ ...m, uid: '' }))
    expect(strip(second.members)).toEqual(strip(first))
  })

  it('exports English names even for German input', () => {
    const { members } = importPaste('Gortrom @ Offensivweste\n- Holzhammer', 'sv', sv)
    expect(exportPaste(members, sv)).toContain('Rillaboom @ Assault Vest')
    expect(exportPaste(members, sv)).toContain('- Wood Hammer')
  })
})

describe('importPaste (champions stat points)', () => {
  const paste = `Incineroar @ Sitrus Berry
Ability: Intimidate
Tera Type: Ghost
EVs: 32 HP / 2 Atk / 32 Def / 0 SpA / 0 SpD
Careful Nature
- Fake Out`

  it('reads EVs lines as Stat Points', () => {
    const { members, warnings } = importPaste(paste, 'champions', champions)
    expect(warnings).toEqual([])
    expect(members[0]?.statPoints).toEqual({ hp: 32, atk: 2, def: 32, spa: 0, spd: 0, spe: 0 })
    expect(members[0]?.evs).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })
    expect(members[0]?.teraType).toBeUndefined()
  })

  it('drops spreads that look like real EVs', () => {
    const { members, warnings } = importPaste(
      'Incineroar\nEVs: 252 HP / 252 Atk / 4 Def',
      'champions',
      champions,
    )
    expect(members[0]?.statPoints).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })
    expect(warnings.join()).toMatch(/Stat Points must be/)
    const total = importPaste('Incineroar\nEVs: 32 HP / 32 Atk / 32 Def', 'champions', champions)
    expect(total.warnings.join()).toMatch(/Stat Points must be/)
  })

  it('exports stat points on the EVs line without Tera Type', () => {
    const { members } = importPaste(paste, 'champions', champions)
    const text = exportPaste(members, champions)
    expect(text).toContain('EVs: 32 HP / 2 Atk / 32 Def')
    expect(text).not.toContain('Tera Type')
    const again = importPaste(text, 'champions', champions).members[0]
    expect(again?.statPoints).toEqual(members[0]?.statPoints)
  })
})

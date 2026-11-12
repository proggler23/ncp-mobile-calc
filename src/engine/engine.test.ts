import { describe, expect, it, vi } from 'vitest'
import {
  calculate,
  calculateAsync,
  getGenInfo,
  InputError,
  listGens,
  prepare,
  type CalcInput,
  type GenId,
} from './index'
import { loadCore } from './runtime'

interface GoldenFile {
  gen: number
  scenarios: { id: string; input: CalcInput }[]
}
const goldenFiles = Object.values(
  import.meta.glob<GoldenFile>('./__golden__/gen-*.json', { eager: true, import: 'default' }),
)

const base: CalcInput = {
  gen: 9,
  attacker: { species: 'Flutter Mane', moves: ['Moonblast'] },
  defender: { species: 'Incineroar', moves: ['Flare Blitz'] },
}

describe('engine API', () => {
  it('lists every generation NCP supports', () => {
    expect(listGens().map((g) => g.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 7.5, 8, 9, 9.5, 10])
    expect(getGenInfo(10).statSystem).toBe('stat-points')
    expect(getGenInfo(9.5).singlesOnly).toBe(true)
  })

  it('requires prepare() before calculate()', async () => {
    vi.resetModules()
    const fresh = await import('./index')
    expect(() => fresh.calculate(base)).toThrow(/prepare/)
    await fresh.prepare(9)
    expect(fresh.calculate(base).moves[0]?.damage).toHaveLength(16)
  })

  it('returns damage, percent range and NCP texts', async () => {
    const result = await calculateAsync(base)
    const m = result.moves[0]!
    expect(m.move).toBe('Moonblast')
    expect(m.description).toBe('0 SpA Flutter Mane Moonblast vs. 0 HP  / 0 SpD Incineroar')
    const rolls = m.damage as number[]
    expect(m.minMax).toEqual([rolls[0], rolls[15]])
    expect(m.percentRange[0]).toBeLessThanOrEqual(m.percentRange[1])
    expect(m.koChance).toMatch(/HKO/)
    expect(result.moves).toHaveLength(4)
    expect(result.moves[3]?.move).toBe('(No Move)')
    expect(result.reverseMoves[0]?.move).toBe('Flare Blitz')
  })

  it('rejects unknown species and moves with InputError', async () => {
    await prepare(9)
    expect(() => calculate({ ...base, attacker: { species: 'Missingno', moves: [] } })).toThrow(
      InputError,
    )
    expect(() =>
      calculate({ ...base, attacker: { species: 'Flutter Mane', moves: ['Not A Move'] } }),
    ).toThrow(/Unknown move/)
  })

  it('warns and falls back for items/abilities missing from the generation', async () => {
    await prepare(9)
    const result = calculate({
      ...base,
      attacker: {
        species: 'Flutter Mane',
        item: 'Not An Item',
        ability: 'Nope',
        moves: ['Moonblast'],
      },
    })
    expect(result.warnings).toHaveLength(2)
  })

  it('ignores ability/item inputs in generations that have none', async () => {
    await prepare(1)
    const result = calculate({
      gen: 1,
      attacker: {
        species: 'Tauros',
        level: 100,
        item: 'Leftovers',
        ability: 'Intimidate',
        moves: ['Body Slam'],
      },
      defender: { species: 'Chansey', level: 100, moves: [] },
    })
    expect(result.moves[0]?.description).not.toMatch(/Leftovers|Intimidate/)
    expect(result.warnings).toEqual([])
  })
})

describe('sandbox hygiene', () => {
  it('does not leak globals and keeps no state between calculations', async () => {
    const before = new Set(Reflect.ownKeys(globalThis))
    const first = goldenFiles.find((f) => f.gen === 9)!.scenarios[0]!.input
    await prepare(9)
    const a = calculate(first)
    for (const f of goldenFiles) {
      await prepare(f.gen as GenId)
      for (const sc of f.scenarios) calculate(sc.input)
    }
    await prepare(9)
    const again = calculate(first)
    expect(again).toEqual(a)
    const leaked = Reflect.ownKeys(globalThis)
      .filter((k) => !before.has(k))
      .map(String)
    expect(leaked).toEqual([])
  })

  it('never hits a jQuery method the stub does not know (no swallowed reads)', async () => {
    const rt = await loadCore()
    for (const f of goldenFiles) {
      await prepare(f.gen as GenId)
      for (const sc of f.scenarios.slice(0, 5)) calculate(sc.input)
    }
    expect([...rt.stub.unknownCalls]).toEqual([])
  })
})

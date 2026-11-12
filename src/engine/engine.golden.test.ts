import { beforeAll, describe, expect, it } from 'vitest'
import { calculate, prepare, type CalcInput, type GenId } from './index'

interface ExpectedMove {
  damage: number[] | number[][]
  description: string
  damageText: string
  koChanceText: string
  hits: number
  cooldown?: string
}
interface Scenario {
  id: string
  input: CalcInput
  expected: { moves: ExpectedMove[]; reverseMoves: ExpectedMove[] }
}
interface GoldenFile {
  upstreamSha: string
  gen: number
  scenarios: Scenario[]
}

const files = import.meta.glob<GoldenFile>('./__golden__/gen-*.json', {
  eager: true,
  import: 'default',
})
const golden = Object.values(files).sort((a, b) => a.gen - b.gen)

describe.each(golden.map((g) => [g.gen, g] as const))('golden gen %s', (_gen, file) => {
  beforeAll(async () => {
    await prepare(file.gen as GenId)
  })
  it.each(file.scenarios.map((s) => [s.id, s] as const))('%s', (_id, sc) => {
    const result = calculate(sc.input)
    const pick = (m: (typeof result.moves)[number]): ExpectedMove => ({
      damage: m.damage,
      description: m.description,
      damageText: m.damageText,
      koChanceText: m.koChance,
      hits: m.hits,
      ...(m.cooldown !== undefined ? { cooldown: m.cooldown } : {}),
    })
    expect(result.moves.map(pick)).toEqual(sc.expected.moves)
    expect(result.reverseMoves.map(pick)).toEqual(sc.expected.reverseMoves)
  })
})

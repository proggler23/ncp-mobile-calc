import { fillState, InputError } from './adapter'
import { getGenInfo, listGens } from './gens'
import { getRuntime, prepare } from './runtime'
import type { CalcInput, CalcResult, GenId, MoveResult } from './types'

export { listGens, getGenInfo, prepare, InputError }
export type * from './types'
export { GEN_IDS } from './types'

/** Words that NCP prints for status-only slots; used to keep slot results aligned. */
function toMoveResults(
  rt: ReturnType<typeof getRuntime>,
  raw: ReturnType<ReturnType<typeof getRuntime>['api']['run']>[number],
  names: string[],
  defenderMaxHP: number,
): MoveResult[] {
  return raw.map((r, i) => {
    const damage = Array.isArray(r.damage[0])
      ? (r.damage as number[][]).map((rolls) => [...rolls])
      : [...(r.damage as number[])]
    const [min, max] = rt.api.calcMinMaxDamage(damage, r.hits)
    const pct = (n: number) => Math.floor((n * 1000) / defenderMaxHP) / 10
    const out: MoveResult = {
      move: names[i] ?? '(No Move)',
      damage,
      hits: r.hits,
      description: r.description,
      koChance: r.koChanceText,
      damageText: r.damageText,
      percentRange: [pct(min), pct(max)],
      minMax: [min, max],
    }
    if (r.cooldown !== undefined) out.cooldown = r.cooldown
    return out
  })
}

/**
 * Calculates all four move slots of both Pokemon exactly like the original NCP calculator.
 * Synchronous; `prepare(input.gen)` must have been awaited once beforehand.
 */
export function calculate(input: CalcInput): CalcResult {
  getGenInfo(input.gen)
  const rt = getRuntime(input.gen)
  const filled = fillState(rt, input)
  const [fwd, rev] = rt.api.run()
  return {
    gen: input.gen,
    moves: toMoveResults(rt, fwd, filled.attackerMoves, filled.defenderMaxHP),
    reverseMoves: toMoveResults(rt, rev, filled.defenderMoves, filled.attackerMaxHP),
    attackerMaxHP: filled.attackerMaxHP,
    defenderMaxHP: filled.defenderMaxHP,
    attackerStats: filled.attackerStats,
    defenderStats: filled.defenderStats,
    warnings: filled.warnings,
  }
}

/** Convenience: `prepare` + `calculate`. */
export async function calculateAsync(input: CalcInput): Promise<CalcResult> {
  await prepare(input.gen as GenId)
  return calculate(input)
}

import type { MoveResult } from '../../engine/types'
import { plainText } from './ko'

/**
 * Short form of NCP's KO text for the collapsed results line: `guaranteed OHKO` -> `OHKO`,
 * `possible 6HKO after Leftovers recovery` -> `~6HKO`, `52.4% chance to 3HKO` -> `52% 3HKO`.
 * Undefined when the text has no KO part (status moves, jokes, "no damage").
 */
export function shortKo(text: string): string | undefined {
  const plain = plainText(text)
  const m = /\b(O|\d+)HKO\b/.exec(plain)
  if (!m) return undefined
  const hits = `${m[1]}HKO`
  const chance = /(\d+(?:\.\d+)?)% chance/.exec(plain)
  if (chance) {
    const pct = Number(chance[1])
    return `${pct > 0 && pct < 1 ? '<1' : Math.round(pct)}% ${hits}`
  }
  if (/possible/i.test(plain)) return `~${hits}`
  return hits
}

export interface BestMove {
  name: string
  /** `min–max%` */
  range: string
  ko?: string
  /** How many other damaging moves there are. */
  others: number
}

const pct = (n: number) => String(Math.round(n * 10) / 10)

/** The damaging move with the highest max % (the first one on a tie); undefined without damage. */
export function bestMove(rows: { r: MoveResult; name: string }[]): BestMove | undefined {
  const damaging = rows.filter(({ r }) => r.minMax[1] > 0)
  let best: { r: MoveResult; name: string } | undefined
  for (const row of damaging) {
    if (!best || row.r.percentRange[1] > best.r.percentRange[1]) best = row
  }
  if (!best) return undefined
  const [lo, hi] = best.r.percentRange
  return {
    name: best.name,
    range: `${pct(lo)}–${pct(hi)}%`,
    ko: shortKo(best.r.koChance),
    others: damaging.length - 1,
  }
}

/** `Flare Blitz 12.8–15.3% · 9HKO (+2)` */
export function summaryText(b: BestMove): string {
  return `${b.name} ${b.range}${b.ko ? ` · ${b.ko}` : ''}${b.others > 0 ? ` (+${b.others})` : ''}`
}

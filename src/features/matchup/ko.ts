export type KoLevel = 'ko1' | 'ko1p' | 'ko2' | 'ko3' | 'none'

/** NCP may emit HTML (status/joke texts); we only ever show it as plain text. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Classify NCP's KO chance text: `ko1` = guaranteed or >= 50% OHKO, `ko1p` = possible OHKO,
 * `ko2`/`ko3` = (guaranteed/likely) 2HKO / 3HKO, `none` = anything slower or no damage.
 */
export function koLevel(text: string): KoLevel {
  const m = /(\d+)HKO/.exec(text)
  if (!m) return 'none'
  const n = Number(m[1])
  const chance = /(\d+(?:\.\d+)?)% chance/.exec(text)
  const sure = !chance && !/possible/i.test(text)
  if (n === 1) return sure || (chance && Number(chance[1]) >= 50) ? 'ko1' : 'ko1p'
  if (n === 2) return 'ko2'
  if (n === 3) return 'ko3'
  return 'none'
}

/** The `(48 - 56.9%)` part of NCP's damage text; falls back to the computed range. */
export function percentText(damageText: string, range: [number, number]): string {
  const m = /\(([^)]*%)\)/.exec(damageText)
  return m?.[1] ?? `${range[0]} - ${range[1]}%`
}

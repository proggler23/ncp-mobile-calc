import { describe, expect, it } from 'vitest'
import type { MoveResult } from '../../engine/types'
import { bestMove, shortKo, summaryText } from './summary'

describe('shortKo', () => {
  it.each([
    ['guaranteed OHKO', 'OHKO'],
    ['guaranteed 2HKO', '2HKO'],
    ['guaranteed 3HKO after Leftovers recovery', '3HKO'],
    ['possible 6HKO', '~6HKO'],
    ['possible 5HKO after Sitrus Berry recovery', '~5HKO'],
    ['62.5% chance to OHKO', '63% OHKO'],
    ['51.6% chance to 3HKO', '52% 3HKO'],
    ['0.11% chance to 4HKO', '<1% 4HKO'],
    ['92.85% chance to 3HKO after Grassy Terrain recovery', '93% 3HKO'],
    ['<b>guaranteed</b> 2HKO', '2HKO'],
  ])('%s -> %s', (text, short) => {
    expect(shortKo(text)).toBe(short)
  })

  it.each(['', 'possibly the worst move ever', "It's a status move, it won't deal damage."])(
    'no KO part in %j',
    (text) => {
      expect(shortKo(text)).toBeUndefined()
    },
  )
})

const row = (name: string, range: [number, number], ko: string, max = 10): MoveResult =>
  ({ move: name, minMax: [0, max], percentRange: range, koChance: ko }) as unknown as MoveResult

describe('bestMove / summaryText', () => {
  it('takes the damaging move with the highest max %, ignoring status moves', () => {
    const b = bestMove([
      { r: row('Fake Out', [5.9, 7.4], 'possibly the worst move ever'), name: 'Fake Out' },
      { r: row('Knock Off', [20.1, 24], 'guaranteed 5HKO'), name: 'Knock Off' },
      { r: row('Flare Blitz', [12.8, 15.3], 'possible 9HKO'), name: 'Flare Blitz' },
      { r: row('Parting Shot', [0, 0], '', 0), name: 'Parting Shot' },
    ])
    expect(b).toEqual({ name: 'Knock Off', range: '20.1–24%', ko: '5HKO', others: 2 })
    expect(summaryText(b!)).toBe('Knock Off 20.1–24% · 5HKO (+2)')
  })

  it('drops the KO part when there is none and the (+N) when it is the only move', () => {
    const b = bestMove([
      { r: row('Fake Out', [5.9, 7.4], 'possibly the worst move ever'), name: 'Fake Out' },
    ])
    expect(summaryText(b!)).toBe('Fake Out 5.9–7.4%')
  })

  it('is undefined without a damaging move', () => {
    expect(bestMove([{ r: row('Protect', [0, 0], '', 0), name: 'Protect' }])).toBeUndefined()
    expect(bestMove([])).toBeUndefined()
  })
})

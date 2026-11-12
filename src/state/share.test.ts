import { beforeEach, describe, expect, it } from 'vitest'
import { moveLine } from '../features/matchup/ko'
import { encodeShare } from '../share/codec'
import {
  flushMatchup,
  getRepository,
  initApp,
  patchField,
  pickSpecies,
  resetStore,
  setDirection,
  setGen,
  setMatchup,
  setSideFlag,
  store,
  updateSet,
} from './app'
import { blankSet } from './sets'
import {
  buildSharePayload,
  contextLine,
  openSharedLink,
  prepareShare,
  undoSharedLoad,
} from './share'

beforeEach(async () => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  const repo = await getRepository()
  await repo.setSettings({ gen: 'champions', format: 'doubles', lang: 'en' })
  for (const g of ['champions', 'sv'] as const) await repo.setMatchup(g, { savedAt: 1 })
  resetStore()
  await initApp()
})

/** A matchup with battle state and field effects, so the round trip has something to lose. */
async function build() {
  await pickSpecies('mine', 'incineroar')
  await pickSpecies('opp', 'garchomp')
  updateSet('mine', (s) => ({
    ...s,
    moveIds: ['fakeout', 'flareblitz', 'knockoff', 'partingshot'],
    moveOverrides: [undefined, { crit: true }],
    status: 'Burned',
    boosts: { atk: 1 },
    percentHP: 80,
    statPoints: { hp: 32, atk: 2, def: 0, spa: 0, spd: 32, spe: 0 },
  }))
  updateSet('opp', (s) => ({ ...s, boosts: { def: -1 }, itemId: 'lifeorb' }))
  patchField((f) => ({ ...f, weather: 'Sun', gravity: true }))
  setSideFlag('opp', 'reflect', true)
  setSideFlag('mine', 'tailwind', true)
}

const rolls = () => {
  const c = store.get().calc
  if (!c) throw new Error('no calculation')
  return JSON.stringify([c.result.moves, c.result.reverseMoves])
}

describe('shared calc flow', () => {
  it('opens a link to exactly the same damage rolls, and Undo restores the previous matchup', async () => {
    await build()
    const original = rolls()
    const shared = store.get()
    const token = await encodeShare(buildSharePayload(shared, { direction: 'reverse', index: 1 }))

    // Somewhere else: another generation with another matchup.
    await setGen('sv')
    setMatchup(blankSet('sv', 'pikachu'), blankSet('sv', 'garchomp'))
    const before = store.get()
    expect(before.gen).toBe('sv')

    history.replaceState(null, '', `/#/c/${token}`)
    await openSharedLink(token)
    const s = store.get()
    expect(location.hash).toBe('#/')
    expect(s.gen).toBe('champions')
    expect(s.format).toBe('doubles')
    expect(s.regulation).toBe(shared.regulation)
    expect(rolls()).toBe(original) // damage rolls, descriptions and KO texts, byte for byte
    expect(s.direction).toBe('reverse')
    expect(s.focusMove).toMatchObject({ direction: 'reverse', index: 1 })
    expect(s.shareNotice).toMatchObject({ kind: 'loaded', warnings: [] })
    // The shared matchup is persisted like any other (and the switch to its generation, too).
    await flushMatchup()
    const repo = await getRepository()
    expect((await repo.getSettings()).gen).toBe('champions')
    expect((await repo.getMatchup('champions'))?.mine?.speciesId).toBe('incineroar')

    await undoSharedLoad()
    const u = store.get()
    expect(u.shareNotice).toBeUndefined()
    expect(u.gen).toBe('sv')
    expect(u.mine).toBe(before.mine)
    expect(u.opp).toBe(before.opp)
    expect(u.field).toBe(before.field)
    expect(u.regulation).toBe(before.regulation)
    expect(u.format).toBe(before.format)
    expect(u.direction).toBe(before.direction)
    expect(u.calc?.result.moves.map((m) => m.description)).toEqual(
      before.calc?.result.moves.map((m) => m.description),
    )
  })

  it('works within the same generation and applies the link only once per hash', async () => {
    await build()
    const original = rolls()
    const token = await encodeShare(
      buildSharePayload(store.get(), { direction: 'forward', index: 0 }),
    )
    setMatchup(undefined, undefined)
    const both = Promise.all([openSharedLink(token), openSharedLink(token)])
    await both
    expect(rolls()).toBe(original)
    expect(store.get().direction).toBe('forward')
  })

  it('drops unknown entries with warnings but still opens the rest', async () => {
    await build()
    const p = buildSharePayload(store.get(), { direction: 'forward', index: 3 })
    p.mine = {
      ...p.mine!,
      moveIds: ['fakeout', 'notamove', 'knockoff', 'partingshot'],
      itemId: 'notanitem',
    }
    p.opp = { ...p.opp!, speciesId: 'notamon' }
    p.regulation = 'regzzz'
    const token = await encodeShare(p)
    setMatchup(undefined, undefined)
    await openSharedLink(token)
    const s = store.get()
    expect(s.mine?.moveIds).toEqual(['fakeout', 'knockoff', 'partingshot'])
    expect(s.mine?.itemId).toBeUndefined()
    expect(s.opp).toBeUndefined()
    // forward index 3 -> slot 2 after the dropped move
    expect(s.focusMove).toMatchObject({ direction: 'forward', index: 2 })
    const keys = s.shareNotice?.kind === 'loaded' ? s.shareNotice.warnings.map((w) => w.key) : []
    expect(keys).toEqual(expect.arrayContaining(['move', 'item', 'species', 'regulation']))
  })

  it('keeps the current state and shows an error for garbage links', async () => {
    await build()
    const before = store.get()
    for (const bad of ['', 'v1.@@@', 'v7.abcd', `v1r.${'A'.repeat(5000)}`]) {
      await openSharedLink(bad)
      expect(store.get().shareNotice).toMatchObject({ kind: 'error' })
      expect(store.get().mine).toBe(before.mine)
      expect(store.get().opp).toBe(before.opp)
      expect(store.get().gen).toBe('champions')
      setDirection('forward')
    }
  })
})

describe('share message', () => {
  it('has the NCP line, a localized context line and the link', async () => {
    await build()
    setDirection('reverse')
    const s = store.get()
    const row = s.calc!.result.reverseMoves[1]!
    const c = await prepareShare(row, { direction: 'reverse', index: 1 })
    const [line1, line2] = c.text.split('\n')
    expect(line1).toBe(moveLine(row))
    expect(line1).toContain('Garchomp Rock Slide vs.')
    expect(line1).toMatch(/\d%/)
    expect(line2).toBe('Reg M-C · Doubles · ☀ Sun · Gravity · Mine: Tailwind · Opp: Reflect')
    expect(c.url).toMatch(/^http:\/\/localhost(:\d+)?\/#\/c\/v1\.[\w-]+$/)
    expect(c.full).toBe(`${c.text}\n${c.url}`)
    expect(c.title).toBe('NCP Mobile Calc')
    expect(contextLine({ ...s, lang: 'de' } as typeof s, 'de')).toContain('Doppel')
  })
})

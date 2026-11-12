import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedSetLike } from '../bridge/types'
import {
  applyCustomSet,
  applyOppPreset,
  dismissStorageNotice,
  flushMatchup,
  getRepository,
  initApp,
  pickSpecies,
  resetStore,
  selectTeamMember,
  setGen,
  setMatchup,
  store,
  swapSides,
  updateSet,
} from './app'
import { getLib } from './lib'
import { blankSet } from './sets'
import { addMember, createTeam, saveToTeam, updateMember, saveCustomSet } from './teams'
import { emptySpread, type CustomSet, type SavedSet } from '../storage/types'

beforeEach(async () => {
  localStorage.clear()
  const repo = await getRepository()
  await repo.setSettings({ gen: 'sv', format: 'doubles', lang: 'en' })
  await repo.importBackup(
    JSON.stringify({ app: 'ncp-mobile-calc', version: 1, teams: [], customSets: [] }),
    'replace',
  )
  resetStore()
  await initApp()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

/** Replaces members of the (otherwise frozen) bridge module namespace for one test. */
function stubBridge(over: Record<string, unknown>): () => void {
  const lib = getLib()
  const orig = lib.bridge
  Object.defineProperty(lib, 'bridge', {
    value: { ...orig, ...over },
    configurable: true,
    writable: true,
  })
  return () =>
    Object.defineProperty(lib, 'bridge', { value: orig, configurable: true, writable: true })
}

const AV3 = { ...emptySpread(0), hp: 200, atk: 200, spe: 200 }

describe('LGPE (Awakening Values) persistence', () => {
  it('round-trips a gen 7.5 matchup with three stats at 200 AV', async () => {
    await setGen('lgpe')
    const mine: SavedSetLike = { ...blankSet('lgpe', 'pikachu'), evs: AV3 }
    setMatchup(mine, blankSet('lgpe', 'eevee'))
    await flushMatchup()
    expect(store.get().storageNotice).toBeUndefined()
    const stored = await (await getRepository()).getMatchup('lgpe')
    expect(stored?.mine?.evs).toEqual(AV3)

    // and it is restored when the generation is entered again
    await setGen('sv')
    await setGen('lgpe')
    expect(store.get().mine?.evs).toEqual(AV3)
  })

  it('saves a 7.5 team member and a custom set with 200 AV', async () => {
    await setGen('lgpe')
    const set: SavedSetLike = { ...blankSet('lgpe', 'pikachu'), evs: AV3 }
    const team = await createTeam('LGPE', 'lgpe')
    await saveToTeam(team.uid, set)
    expect((await (await getRepository()).getTeam(team.uid))?.members[0]?.evs).toEqual(AV3)
    const cs = await saveCustomSet('lgpe', 'AV', set)
    expect(cs.set.evs).toEqual(AV3)
  })
})

describe('matchup persistence failures', () => {
  it('warns on the console and raises the notice only once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const repo = await getRepository()
    vi.spyOn(repo, 'setMatchup').mockRejectedValue(new Error('quota'))
    setMatchup(blankSet('sv', 'garchomp'), undefined)
    await flushMatchup()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(store.get().storageNotice).toBe(true)
    dismissStorageNotice()
    setMatchup(blankSet('sv', 'incineroar'), undefined)
    await flushMatchup()
    expect(warn).toHaveBeenCalledTimes(2)
    expect(store.get().storageNotice).toBeUndefined()
  })

  it('writes when the page becomes hidden, without waiting for the debounce', async () => {
    setMatchup(blankSet('sv', 'garchomp'), undefined)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    try {
      await vi.waitFor(
        async () =>
          expect((await (await getRepository()).getMatchup('sv'))?.mine?.speciesId).toBe(
            'garchomp',
          ),
        { timeout: 300, interval: 10 }, // well below the 400 ms debounce
      )
    } finally {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    }
  })

  it('writes on pagehide', async () => {
    setMatchup(blankSet('sv', 'incineroar'), undefined)
    window.dispatchEvent(new Event('pagehide'))
    await vi.waitFor(
      async () =>
        expect((await (await getRepository()).getMatchup('sv'))?.mine?.speciesId).toBe(
          'incineroar',
        ),
      { timeout: 300, interval: 10 },
    )
  })
})

describe('concurrent team mutations', () => {
  it('keeps both members of two simultaneous addMember calls', async () => {
    const team = await createTeam('T', 'sv')
    await Promise.all([addMember(team.uid, 'garchomp'), addMember(team.uid, 'incineroar')])
    const members = (await (await getRepository()).getTeam(team.uid))!.members
    expect(members.map((m) => m.speciesId).sort()).toEqual(['garchomp', 'incineroar'])
  })

  it('serializes mixed mutations and survives a failing one', async () => {
    const team = await createTeam('T', 'sv')
    await addMember(team.uid, 'garchomp')
    const first = (await (await getRepository()).getTeam(team.uid))!.members[0]!
    const results = await Promise.allSettled([
      addMember('missing-team', 'garchomp'),
      saveToTeam(team.uid, { ...blankSet('sv', 'fluttermane') }),
      updateMember(team.uid, first.uid, { ...blankSet('sv', 'garchomp'), nickname: 'Chomp' }),
      addMember(team.uid, 'incineroar'),
    ])
    expect(results.map((r) => r.status)).toEqual([
      'rejected',
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ])
    const members = (await (await getRepository()).getTeam(team.uid))!.members
    expect(members.map((m) => m.speciesId)).toEqual(['garchomp', 'fluttermane', 'incineroar'])
    expect(members[0]?.nickname).toBe('Chomp')
  })

  it('names a nameless team with the translated default', async () => {
    const t = await createTeam('   ', 'sv')
    expect(t.name).toBe('Team')
  })
})

describe('stale async results', () => {
  const customSet = (speciesId: string): CustomSet => ({
    uid: 'c1',
    name: 'c',
    gen: 'sv',
    speciesId,
    set: {
      level: 50,
      nature: 'Adamant',
      moveIds: [],
      evs: emptySpread(0),
      ivs: emptySpread(31),
    },
    createdAt: 1,
    updatedAt: 1,
  })

  it('a slow pickSpecies does not overwrite a custom set applied meanwhile', async () => {
    const slow = deferred<undefined>()
    const restore = stubBridge({ loadCommonSets: () => slow.promise })
    try {
      const pick = pickSpecies('opp', 'incineroar')
      applyCustomSet(customSet('garchomp'))
      slow.resolve(undefined)
      await pick
      expect(store.get().opp?.speciesId).toBe('garchomp')
      expect(store.get().oppPreset).toBeNull()
    } finally {
      restore()
    }
  })

  it('a slow pickSpecies does not overwrite a swap', async () => {
    setMatchup(blankSet('sv', 'garchomp'), blankSet('sv', 'incineroar'))
    const slow = deferred<undefined>()
    const restore = stubBridge({ loadCommonSets: () => slow.promise })
    try {
      const pick = pickSpecies('mine', 'fluttermane')
      swapSides()
      slow.resolve(undefined)
      await pick
      expect(store.get().mine?.speciesId).toBe('incineroar')
      expect(store.get().opp?.speciesId).toBe('garchomp')
    } finally {
      restore()
    }
  })

  it('a slow pickSpecies does not overwrite setMatchup or a team member selection', async () => {
    const member: SavedSet = {
      uid: 'm1',
      gen: 'sv',
      speciesId: 'incineroar',
      level: 50,
      nature: 'Careful',
      moveIds: [],
      evs: emptySpread(0),
      ivs: emptySpread(31),
    }
    store.set({
      team: { uid: 't', name: 't', gen: 'sv', members: [member], createdAt: 1, updatedAt: 1 },
    })
    const slow = deferred<undefined>()
    const restore = stubBridge({ loadCommonSets: () => slow.promise })
    try {
      const pick1 = pickSpecies('mine', 'fluttermane')
      selectTeamMember(0)
      slow.resolve(undefined)
      await pick1
      expect(store.get().mine?.speciesId).toBe('incineroar')
      expect(store.get().mineTeamIndex).toBe(0)

      const slow2 = deferred<undefined>()
      const restore2 = stubBridge({ loadCommonSets: () => slow2.promise })
      const pick2 = pickSpecies('opp', 'fluttermane')
      setMatchup(blankSet('sv', 'garchomp'), blankSet('sv', 'koraidon'))
      slow2.resolve(undefined)
      await pick2
      restore2()
      expect(store.get().opp?.speciesId).toBe('koraidon')
    } finally {
      restore()
    }
  })

  it('a slow opponent preset is discarded when the opponent was edited meanwhile', async () => {
    await pickSpecies('opp', 'incineroar')
    const slow = deferred<SavedSetLike>()
    const restore = stubBridge({ applyPresetAsync: () => slow.promise })
    try {
      const apply = applyOppPreset('physDef')
      updateSet('opp', (s) => ({ ...s, nature: 'Timid' }))
      slow.resolve({ ...blankSet('sv', 'incineroar'), nature: 'Bold' })
      await apply
      expect(store.get().opp?.nature).toBe('Timid')
      expect(store.get().oppPreset).toBeNull()
    } finally {
      restore()
    }
  })

  it('a slow opponent preset is discarded after a swap', async () => {
    setMatchup(blankSet('sv', 'garchomp'), blankSet('sv', 'incineroar'))
    const slow = deferred<SavedSetLike>()
    const restore = stubBridge({ applyPresetAsync: () => slow.promise })
    try {
      const apply = applyOppPreset('specDef')
      swapSides()
      slow.resolve({ ...blankSet('sv', 'incineroar'), nature: 'Calm' })
      await apply
      expect(store.get().opp?.speciesId).toBe('garchomp')
      expect(store.get().mine?.nature).not.toBe('Calm')
    } finally {
      restore()
    }
  })
})

describe('auto weather priority (last changed Pokemon wins)', () => {
  const weather = () => store.get().calc?.input.field?.weather

  it('keeps the same Pokemon in charge across a swap', () => {
    const torkoal = { ...blankSet('sv', 'torkoal'), abilityId: 'drought' }
    const pelipper = { ...blankSet('sv', 'pelipper'), abilityId: 'drizzle' }
    setMatchup(torkoal, pelipper)
    expect(weather()).toBe('Rain') // the opponent was set last
    swapSides()
    expect(store.get().mine?.speciesId).toBe('pelipper')
    expect(weather()).toBe('Rain')
    swapSides()
    expect(weather()).toBe('Rain')
  })

  it('follows the Pokemon whose ability changed last', () => {
    setMatchup(
      { ...blankSet('sv', 'torkoal'), abilityId: 'drought' },
      { ...blankSet('sv', 'pelipper'), abilityId: 'drizzle' },
    )
    expect(weather()).toBe('Rain')
    updateSet('mine', (s) => ({ ...s, abilityId: 'whitesmoke' }))
    updateSet('mine', (s) => ({ ...s, abilityId: 'drought' }))
    expect(weather()).toBe('Sun')
    swapSides()
    expect(weather()).toBe('Sun')
  })
})

describe('untrusted ids never reach prototype members', () => {
  it('rejects tampered matchups at the storage boundary', async () => {
    const repo = await getRepository()
    const bad = (over: Record<string, unknown>) =>
      repo.setMatchup('sv', { mine: { speciesId: 'garchomp', moveIds: [], ...over }, savedAt: 1 })
    await expect(bad({ nature: 'constructor' })).rejects.toMatchObject({ code: 'invalid' })
    await expect(bad({ abilityId: '__proto__' })).rejects.toMatchObject({ code: 'invalid' })
    await expect(bad({ itemId: 'toString' })).rejects.toMatchObject({ code: 'invalid' })
  })

  it('calculates (or reports) without throwing for prototype-named values', () => {
    const evil = {
      ...blankSet('sv', 'garchomp'),
      nature: 'constructor',
      abilityId: 'constructor',
      itemId: 'constructor',
      moveIds: ['constructor', 'earthquake'],
    }
    expect(() => setMatchup(evil as SavedSetLike, blankSet('sv', 'incineroar'))).not.toThrow()
    expect(() =>
      setMatchup(blankSet('sv', 'constructor'), blankSet('sv', 'incineroar')),
    ).not.toThrow()
    // the engine refuses the nature with a typed error instead of resolving Object.prototype
    expect(store.get().calc).toBeUndefined()
  })

  it('the engine refuses inherited names with InputError', async () => {
    const { engine } = getLib()
    const base = {
      gen: 9 as const,
      attacker: { species: 'Garchomp', moves: ['Earthquake'] },
      defender: { species: 'Incineroar', moves: [] },
    }
    for (const attacker of [
      { ...base.attacker, nature: 'constructor' },
      { ...base.attacker, species: 'constructor' },
      { ...base.attacker, moves: ['constructor'] },
    ]) {
      expect(() => engine.calculate({ ...base, attacker })).toThrow(engine.InputError)
    }
  })
})

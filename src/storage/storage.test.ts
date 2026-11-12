import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalStorageBackend, openBackend } from './backend'
import type { Backend } from './backend'
import { createRepository, StorageError } from './repository'
import type { Repository } from './repository'
import { parseMatchup, parseSavedSet, parseSettings, parseTeam } from './schema'
import { emptySpread, LIMITS } from './types'
import type { SavedSet, SetBody } from './types'

function member(over: Partial<SavedSet> = {}): SavedSet {
  return {
    uid: 'm1',
    gen: 'sv',
    speciesId: 'incineroar',
    level: 50,
    nature: 'Careful',
    moveIds: ['fakeout'],
    evs: emptySpread(0),
    ivs: emptySpread(31),
    ...over,
  }
}

function bodyOf(m: SavedSet): SetBody {
  const body: Partial<SavedSet> = { ...m }
  delete body.uid
  delete body.gen
  delete body.speciesId
  return body as SetBody
}

const backends: [string, () => Promise<Backend>][] = [
  ['indexeddb', () => openBackend({ dbName: `t-${Math.random()}` })],
  ['localstorage', async () => createLocalStorageBackend()],
]

describe.each(backends)('repository on %s', (kind, make) => {
  let backend: Backend
  let repo: Repository
  beforeEach(async () => {
    localStorage.clear()
    globalThis.indexedDB = new IDBFactory()
    backend = await make()
    repo = createRepository(backend)
  })

  it('uses the expected backend', () => {
    expect(backend.kind).toBe(kind)
  })

  it('does team CRUD', async () => {
    const t = await repo.createTeam({ name: 'Main', gen: 'sv', members: [member()] })
    expect((await repo.listTeams()).map((x) => x.uid)).toEqual([t.uid])
    expect((await repo.getTeam(t.uid))?.members).toHaveLength(1)
    const u = await repo.updateTeam(t.uid, { name: 'Renamed', members: [] })
    expect(u).toMatchObject({ name: 'Renamed', members: [], createdAt: t.createdAt })
    expect(u.updatedAt).toBeGreaterThanOrEqual(t.updatedAt)
    await repo.deleteTeam(t.uid)
    expect(await repo.getTeam(t.uid)).toBeUndefined()
    await expect(repo.updateTeam('nope', { name: 'x' })).rejects.toBeInstanceOf(StorageError)
  })

  it('rejects invalid teams and enforces caps', async () => {
    await expect(
      repo.createTeam({ name: 'x', gen: 'sv', members: Array(7).fill(member()) }),
    ).rejects.toMatchObject({ code: 'invalid' })
    await expect(repo.createTeam({ name: 'x'.repeat(500), gen: 'sv' })).rejects.toMatchObject({
      code: 'invalid',
    })
    for (let i = 0; i < LIMITS.maxTeams; i++) await repo.createTeam({ name: `t${i}`, gen: 'sv' })
    await expect(repo.createTeam({ name: 'over', gen: 'sv' })).rejects.toMatchObject({
      code: 'limit',
    })
  })

  it('manages active team and settings', async () => {
    expect(await repo.getSettings()).toEqual({ lang: 'en', gen: 'champions', format: 'doubles' })
    const t = await repo.createTeam({ name: 'A', gen: 'sv' })
    await repo.setActiveTeam(t.uid)
    expect((await repo.getActiveTeam())?.uid).toBe(t.uid)
    await repo.setSettings({ lang: 'de', gen: 'champions' })
    expect(await repo.getSettings()).toMatchObject({ lang: 'de', gen: 'champions' })
    await repo.deleteTeam(t.uid)
    expect((await repo.getSettings()).activeTeamUid).toBeUndefined()
    await expect(repo.setActiveTeam('ghost')).rejects.toBeInstanceOf(StorageError)
    await expect(repo.setSettings({ lang: 'fr' as 'de' })).rejects.toBeInstanceOf(StorageError)
  })

  it('does custom set CRUD by gen + species', async () => {
    const body = bodyOf(member())
    const a = await repo.createCustomSet({
      name: 'Bulky',
      gen: 'sv',
      speciesId: 'incineroar',
      set: body,
    })
    await repo.createCustomSet({ name: 'Other', gen: 'sv', speciesId: 'rillaboom', set: body })
    await repo.createCustomSet({ name: 'Old', gen: 'swsh', speciesId: 'incineroar', set: body })
    expect(await repo.listCustomSets('sv', 'incineroar')).toHaveLength(1)
    expect(await repo.listCustomSets('sv')).toHaveLength(2)
    expect(await repo.listCustomSets()).toHaveLength(3)
    const u = await repo.updateCustomSet(a.uid, { name: 'Bulkier' })
    expect(u.name).toBe('Bulkier')
    await repo.deleteCustomSet(a.uid)
    expect(await repo.listCustomSets('sv', 'incineroar')).toHaveLength(0)
  })

  it('skips malformed persisted entries', async () => {
    await backend.put('teams', 'bad1', { uid: 'bad1', name: 5 })
    await backend.put('teams', 'bad2', 'garbage')
    await backend.put('settings', 'app', { lang: 'xx' })
    const good = await repo.createTeam({ name: 'ok', gen: 'sv' })
    expect((await repo.listTeams()).map((t) => t.uid)).toEqual([good.uid])
    expect(await repo.getTeam('bad1')).toBeUndefined()
    expect((await repo.getSettings()).lang).toBe('en')
  })

  it('exports and imports backups', async () => {
    const t = await repo.createTeam({ name: 'A', gen: 'sv', members: [member()] })
    await repo.setActiveTeam(t.uid)
    await repo.setSettings({ lang: 'de' })
    const body = bodyOf(member())
    await repo.createCustomSet({ name: 'C', gen: 'sv', speciesId: 'incineroar', set: body })
    const json = await repo.exportBackup()

    await repo.deleteTeam(t.uid)
    const res = await repo.importBackup(json, 'replace')
    expect(res).toEqual({ teams: 1, customSets: 1, settings: true, skipped: 0 })
    expect((await repo.getActiveTeam())?.name).toBe('A')
    expect((await repo.getSettings()).lang).toBe('de')
  })

  it('validates imported backups', async () => {
    await expect(repo.importBackup('nope')).rejects.toBeInstanceOf(StorageError)
    await expect(repo.importBackup('{"app":"other"}')).rejects.toBeInstanceOf(StorageError)
    await expect(
      repo.importBackup('{"app":"ncp-mobile-calc","version":99}'),
    ).rejects.toBeInstanceOf(StorageError)
    const good = await repo.createTeam({ name: 'A', gen: 'sv' })
    const file = JSON.parse(await repo.exportBackup()) as Record<string, unknown[]>
    await repo.deleteTeam(good.uid)
    file.teams = [...(file.teams ?? []), { uid: 'x', name: 1 }, 42, null]
    file.customSets = [{ bogus: true }]
    const res = await repo.importBackup(JSON.stringify(file))
    expect(res).toMatchObject({ teams: 1, customSets: 0, skipped: 4 })
    expect(await repo.listTeams()).toHaveLength(1)
  })

  it('caps teams on import', async () => {
    const now = Date.now()
    const teams = Array.from({ length: 60 }, (_, i) => ({
      uid: `u${i}`,
      name: 't',
      gen: 'sv',
      members: [],
      createdAt: now,
      updatedAt: now,
    }))
    const res = await repo.importBackup(
      JSON.stringify({ app: 'ncp-mobile-calc', version: 1, teams }),
    )
    expect(res.teams).toBe(LIMITS.maxTeams)
    expect(res.skipped).toBe(10)
  })
})

describe('openBackend fallback', () => {
  it('falls back to localStorage without indexedDB', async () => {
    const saved = globalThis.indexedDB
    // @ts-expect-error simulate missing IndexedDB
    delete globalThis.indexedDB
    try {
      expect((await openBackend()).kind).toBe('localstorage')
    } finally {
      globalThis.indexedDB = saved
    }
  })
})

describe('regulation fields', () => {
  const team = { uid: 't1', name: 'T', gen: 'champions', members: [], createdAt: 1, updatedAt: 1 }
  const settings = { lang: 'en', gen: 'champions', format: 'doubles' }

  it('teams are valid with and without a regulation; ids are validated', () => {
    expect(parseTeam(team)).toBeDefined()
    expect(parseTeam({ ...team, regulation: 'regmc' })?.regulation).toBe('regmc')
    expect(parseTeam({ ...team, regulation: 'Reg M-C; <b>' })).toBeUndefined()
  })
  it('settings keep a regulation per gen and fall back to "absent" when broken', () => {
    expect(parseSettings({ ...settings, regulations: { champions: 'regmb', sv: 'none' } })).toEqual(
      {
        ...settings,
        regulations: { champions: 'regmb', sv: 'none' },
      },
    )
    expect(parseSettings(settings)?.regulations).toBeUndefined()
    // a damaged map must not void the other settings
    expect(parseSettings({ ...settings, regulations: { champions: 5 } })).toEqual(settings)
    expect(parseSettings({ ...settings, regulations: { nogen: 'x' } })).toEqual(settings)
  })
})

describe('schema guards', () => {
  it('rejects out-of-range values', () => {
    expect(parseSavedSet(member())).toBeDefined()
    expect(parseSavedSet(member({ level: 0 }))).toBeUndefined()
    expect(parseSavedSet(member({ moveIds: ['a', 'b', 'c', 'd', 'e'] }))).toBeUndefined()
    expect(parseSavedSet(member({ evs: { ...emptySpread(0), hp: 253 } }))).toBeUndefined()
    expect(parseSavedSet(member({ evs: emptySpread(100) }))).toBeUndefined()
    expect(parseSavedSet(member({ ivs: { ...emptySpread(31), spe: 32 } }))).toBeUndefined()
    expect(parseSavedSet(member({ statPoints: emptySpread(12) }))).toBeUndefined()
    expect(parseSavedSet(member({ statPoints: { ...emptySpread(0), hp: 33 } }))).toBeUndefined()
    expect(parseSavedSet(member({ notes: 'x'.repeat(5000) }))).toBeUndefined()
    expect(parseSavedSet({ ...member(), gen: 'gen99' })).toBeUndefined()
    expect(parseTeam(null)).toBeUndefined()
  })
})

describe('generation-aware investment limits (LGPE Awakening Values)', () => {
  const av3 = { ...emptySpread(0), hp: 200, atk: 200, spe: 200 }

  it('accepts three stats at 200 AV in gen 7.5 but not as EVs elsewhere', () => {
    expect(parseSavedSet(member({ gen: 'lgpe', evs: av3 }))).toBeDefined()
    expect(parseSavedSet(member({ gen: 'lgpe', evs: emptySpread(200) }))).toBeDefined()
    expect(
      parseSavedSet(member({ gen: 'lgpe', evs: { ...emptySpread(0), hp: 201 } })),
    ).toBeUndefined()
    expect(parseSavedSet(member({ gen: 'sv', evs: av3 }))).toBeUndefined()
    expect(
      parseSavedSet(member({ gen: 'sv', evs: { ...emptySpread(0), hp: 252, atk: 252, def: 8 } })),
    ).toBeUndefined()
    expect(
      parseSavedSet(member({ gen: 'sv', evs: { ...emptySpread(0), hp: 252, atk: 252, def: 6 } })),
    ).toBeDefined()
  })

  it('saves LGPE team members and custom sets', async () => {
    localStorage.clear()
    globalThis.indexedDB = new IDBFactory()
    const repo = createRepository(await openBackend({ dbName: `t-${Math.random()}` }))
    const m = member({ gen: 'lgpe', speciesId: 'pikachu', evs: av3, moveIds: [] })
    const t = await repo.createTeam({ name: 'LGPE', gen: 'lgpe', members: [m] })
    expect((await repo.getTeam(t.uid))?.members[0]?.evs).toEqual(av3)
    const cs = await repo.createCustomSet({
      name: 'AV',
      gen: 'lgpe',
      speciesId: 'pikachu',
      set: bodyOf(m),
    })
    expect(cs.set.evs).toEqual(av3)
    await expect(
      repo.createCustomSet({ name: 'EV', gen: 'sv', speciesId: 'pikachu', set: bodyOf(m) }),
    ).rejects.toMatchObject({ code: 'invalid' })
  })

  it('round-trips a gen 7.5 matchup', async () => {
    localStorage.clear()
    globalThis.indexedDB = new IDBFactory()
    const repo = createRepository(await openBackend({ dbName: `t-${Math.random()}` }))
    const side = { speciesId: 'pikachu', moveIds: [], evs: av3 }
    await repo.setMatchup('lgpe', { mine: side, opp: side, savedAt: 1 })
    expect((await repo.getMatchup('lgpe'))?.mine?.evs).toEqual(av3)
    await expect(repo.setMatchup('sv', { mine: side, savedAt: 1 })).rejects.toBeInstanceOf(
      StorageError,
    )
  })

  it('caps the team index at the last slot', () => {
    expect(
      parseMatchup({ teamUid: 'x', mineTeamIndex: LIMITS.maxMembers - 1, savedAt: 1 }),
    ).toBeDefined()
    expect(
      parseMatchup({ teamUid: 'x', mineTeamIndex: LIMITS.maxMembers, savedAt: 1 }),
    ).toBeUndefined()
  })
})

describe('untrusted ids and natures', () => {
  it('only accepts canonical natures', () => {
    expect(parseSavedSet(member({ nature: 'Adamant' }))).toBeDefined()
    for (const nature of [
      'constructor',
      '__proto__',
      'toString',
      'adamant',
      'Adamant ',
      'Fröhlich',
    ]) {
      expect(parseSavedSet(member({ nature }))).toBeUndefined()
    }
  })

  it('only accepts lowercase alphanumeric dex ids', () => {
    expect(parseSavedSet(member({ abilityId: '__proto__' }))).toBeUndefined()
    expect(parseSavedSet(member({ itemId: 'toString' }))).toBeUndefined()
    expect(parseSavedSet(member({ moveIds: ['Fake Out'] }))).toBeUndefined()
    expect(parseSavedSet(member({ speciesId: 'a'.repeat(LIMITS.maxIdLength + 1) }))).toBeUndefined()
    expect(parseSavedSet(member({ abilityId: 'intimidate', itemId: 'sitrusberry' }))).toBeDefined()
  })

  it('drops tampered entries of an imported backup', async () => {
    localStorage.clear()
    globalThis.indexedDB = new IDBFactory()
    const repo = createRepository(await openBackend({ dbName: `t-${Math.random()}` }))
    const good = member()
    const file = {
      app: 'ncp-mobile-calc',
      version: 1,
      teams: [
        { uid: 't1', name: 'ok', gen: 'sv', members: [good], createdAt: 1, updatedAt: 1 },
        {
          uid: 't2',
          name: 'a',
          gen: 'sv',
          members: [{ ...good, nature: 'constructor' }],
          createdAt: 1,
          updatedAt: 1,
        },
        {
          uid: 't3',
          name: 'b',
          gen: 'sv',
          members: [{ ...good, abilityId: '__proto__' }],
          createdAt: 1,
          updatedAt: 1,
        },
        {
          uid: 't4',
          name: 'c',
          gen: 'sv',
          members: [{ ...good, itemId: 'toString' }],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      customSets: [],
    }
    const res = await repo.importBackup(JSON.stringify(file))
    expect(res).toMatchObject({ teams: 1, skipped: 3 })
  })
})

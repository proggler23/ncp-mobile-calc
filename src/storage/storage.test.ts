import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalStorageBackend, openBackend } from './backend'
import type { Backend } from './backend'
import { createRepository, StorageError } from './repository'
import type { Repository } from './repository'
import { parseSavedSet, parseTeam } from './schema'
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
    expect(await repo.getSettings()).toEqual({ lang: 'en', gen: 'sv', format: 'doubles' })
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

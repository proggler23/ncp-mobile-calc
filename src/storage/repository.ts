import { openBackend } from './backend'
import type { Backend } from './backend'
import { newUid } from './ids'
import {
  BACKUP_APP_ID,
  backupSchemaVersion,
  parseCustomSet,
  parseMatchup,
  parseSettings,
  parseTeam,
} from './schema'
import { DEFAULT_SETTINGS, LIMITS } from './types'
import type { CustomSet, GenId, SavedSet, SetBody, Settings, StoredMatchup, Team } from './types'

export class StorageError extends Error {
  constructor(
    message: string,
    readonly code: 'limit' | 'invalid' | 'not-found',
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

const SETTINGS_KEY = 'app'

export interface BackupFile {
  app: typeof BACKUP_APP_ID
  version: number
  exportedAt: number
  teams: Team[]
  customSets: CustomSet[]
  settings: Settings
}

export interface ImportResult {
  teams: number
  customSets: number
  settings: boolean
  /** Entries dropped because they were malformed or over a cap. */
  skipped: number
}

export interface Repository {
  readonly kind: Backend['kind']
  listTeams(): Promise<Team[]>
  getTeam(uid: string): Promise<Team | undefined>
  createTeam(input: { name: string; gen: GenId; members?: SavedSet[] }): Promise<Team>
  updateTeam(uid: string, patch: Partial<Pick<Team, 'name' | 'gen' | 'members'>>): Promise<Team>
  deleteTeam(uid: string): Promise<void>
  getActiveTeam(): Promise<Team | undefined>
  setActiveTeam(uid: string | undefined): Promise<Settings>
  listCustomSets(gen?: GenId, speciesId?: string): Promise<CustomSet[]>
  createCustomSet(input: {
    name: string
    gen: GenId
    speciesId: string
    set: SetBody
  }): Promise<CustomSet>
  updateCustomSet(uid: string, patch: Partial<Pick<CustomSet, 'name' | 'set'>>): Promise<CustomSet>
  deleteCustomSet(uid: string): Promise<void>
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  /** Last matchup (both builds + field) of a generation. Not part of the backup file. */
  getMatchup(gen: GenId): Promise<StoredMatchup | undefined>
  setMatchup(gen: GenId, value: StoredMatchup): Promise<void>
  exportBackup(): Promise<string>
  /** Untrusted JSON text. 'merge' upserts by uid; 'replace' wipes teams + custom sets first. */
  importBackup(text: string, mode?: 'merge' | 'replace'): Promise<ImportResult>
}

export function createRepository(backend: Backend): Repository {
  const loadTeams = async () =>
    (await backend.getAll('teams'))
      .map(parseTeam)
      .filter((t): t is Team => t !== undefined)
      .slice(0, LIMITS.maxTeams * 2)
  const loadCustom = async () =>
    (await backend.getAll('customSets'))
      .map(parseCustomSet)
      .filter((c): c is CustomSet => c !== undefined)

  const checked = <T>(v: T | undefined, what: string): T => {
    if (v === undefined) throw new StorageError(`Invalid ${what}`, 'invalid')
    return v
  }

  async function readSettings(): Promise<Settings> {
    return parseSettings(await backend.get('settings', SETTINGS_KEY)) ?? { ...DEFAULT_SETTINGS }
  }

  async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
    const merged = { ...(await readSettings()), ...patch }
    if (patch.activeTeamUid === undefined && 'activeTeamUid' in patch) delete merged.activeTeamUid
    const s = checked(parseSettings(merged), 'settings')
    await backend.put('settings', SETTINGS_KEY, s)
    return s
  }

  const repo: Repository = {
    kind: backend.kind,

    async listTeams() {
      return (await loadTeams()).sort((a, b) => b.updatedAt - a.updatedAt)
    },
    async getTeam(uid) {
      return parseTeam(await backend.get('teams', uid))
    },
    async createTeam({ name, gen, members = [] }) {
      if ((await loadTeams()).length >= LIMITS.maxTeams)
        throw new StorageError(`At most ${LIMITS.maxTeams} teams`, 'limit')
      const now = Date.now()
      const team = checked(
        parseTeam({ uid: newUid(), name, gen, members, createdAt: now, updatedAt: now }),
        'team',
      )
      await backend.put('teams', team.uid, team)
      return team
    },
    async updateTeam(uid, patch) {
      const cur = await repo.getTeam(uid)
      if (!cur) throw new StorageError('Team not found', 'not-found')
      const next = checked(
        parseTeam({
          ...cur,
          ...patch,
          uid,
          updatedAt: Math.max(Date.now(), cur.updatedAt),
        }),
        'team',
      )
      await backend.put('teams', uid, next)
      return next
    },
    async deleteTeam(uid) {
      await backend.delete('teams', uid)
      if ((await readSettings()).activeTeamUid === uid)
        await writeSettings({ activeTeamUid: undefined })
    },
    async getActiveTeam() {
      const uid = (await readSettings()).activeTeamUid
      return uid ? repo.getTeam(uid) : undefined
    },
    async setActiveTeam(uid) {
      if (uid !== undefined && !(await repo.getTeam(uid)))
        throw new StorageError('Team not found', 'not-found')
      return writeSettings({ activeTeamUid: uid })
    },

    async listCustomSets(gen, speciesId) {
      return (await loadCustom())
        .filter(
          (c) => (gen === undefined || c.gen === gen) && (!speciesId || c.speciesId === speciesId),
        )
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    async createCustomSet({ name, gen, speciesId, set }) {
      const all = await loadCustom()
      if (
        all.length >= LIMITS.maxCustomSets ||
        all.filter((c) => c.gen === gen && c.speciesId === speciesId).length >=
          LIMITS.maxCustomSetsPerSpecies
      )
        throw new StorageError('Too many custom sets', 'limit')
      const now = Date.now()
      const cs = checked(
        parseCustomSet({
          uid: newUid(),
          name,
          gen,
          speciesId,
          set,
          createdAt: now,
          updatedAt: now,
        }),
        'custom set',
      )
      await backend.put('customSets', cs.uid, cs)
      return cs
    },
    async updateCustomSet(uid, patch) {
      const cur = parseCustomSet(await backend.get('customSets', uid))
      if (!cur) throw new StorageError('Custom set not found', 'not-found')
      const next = checked(
        parseCustomSet({ ...cur, ...patch, uid, updatedAt: Math.max(Date.now(), cur.updatedAt) }),
        'custom set',
      )
      await backend.put('customSets', uid, next)
      return next
    },
    async deleteCustomSet(uid) {
      await backend.delete('customSets', uid)
    },

    getSettings: readSettings,
    setSettings: writeSettings,

    async getMatchup(gen) {
      return parseMatchup(await backend.get('settings', `matchup:${gen}`), gen)
    },
    async setMatchup(gen, value) {
      // Round trip through JSON: drops `undefined` values and rejects anything the schema refuses.
      const clean = checked(parseMatchup(JSON.parse(JSON.stringify(value)), gen), 'matchup')
      await backend.put('settings', `matchup:${gen}`, clean)
    },

    async exportBackup() {
      const file: BackupFile = {
        app: BACKUP_APP_ID,
        version: backupSchemaVersion,
        exportedAt: Date.now(),
        teams: await repo.listTeams(),
        customSets: await loadCustom(),
        settings: await readSettings(),
      }
      return JSON.stringify(file, null, 2)
    },

    async importBackup(text, mode = 'merge') {
      if (text.length > LIMITS.maxBackupBytes)
        throw new StorageError('Backup file too large', 'invalid')
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        throw new StorageError('Backup is not valid JSON', 'invalid')
      }
      if (!raw || typeof raw !== 'object' || (raw as Record<string, unknown>).app !== BACKUP_APP_ID)
        throw new StorageError('Not an NCP Mobile Calc backup', 'invalid')
      const obj = raw as Record<string, unknown>
      if (typeof obj.version !== 'number' || obj.version > backupSchemaVersion)
        throw new StorageError('Unsupported backup version', 'invalid')

      const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
      const rawTeams = arr(obj.teams)
      const rawCustom = arr(obj.customSets)
      let skipped = 0

      const teams = new Map<string, Team>()
      for (const t of rawTeams) {
        const p = parseTeam(t)
        if (p) teams.set(p.uid, p)
        else skipped++
      }
      const customs = new Map<string, CustomSet>()
      for (const c of rawCustom) {
        const p = parseCustomSet(c)
        if (p) customs.set(p.uid, p)
        else skipped++
      }
      const settings = parseSettings(obj.settings)

      // Caps are applied against the final contents.
      const existingTeams =
        mode === 'replace'
          ? new Map<string, Team>()
          : new Map((await loadTeams()).map((t) => [t.uid, t]))
      const existingCustom =
        mode === 'replace'
          ? new Map<string, CustomSet>()
          : new Map((await loadCustom()).map((c) => [c.uid, c]))
      const acceptedTeams: Team[] = []
      for (const t of teams.values()) {
        if (existingTeams.has(t.uid) || existingTeams.size < LIMITS.maxTeams) {
          existingTeams.set(t.uid, t)
          acceptedTeams.push(t)
        } else skipped++
      }
      const acceptedCustom: CustomSet[] = []
      for (const c of customs.values()) {
        const same = [...existingCustom.values()].filter(
          (x) => x.gen === c.gen && x.speciesId === c.speciesId && x.uid !== c.uid,
        ).length
        if (
          existingCustom.has(c.uid) ||
          (existingCustom.size < LIMITS.maxCustomSets && same < LIMITS.maxCustomSetsPerSpecies)
        ) {
          existingCustom.set(c.uid, c)
          acceptedCustom.push(c)
        } else skipped++
      }

      if (mode === 'replace') {
        await backend.clear('teams')
        await backend.clear('customSets')
      }
      for (const t of acceptedTeams) await backend.put('teams', t.uid, t)
      for (const c of acceptedCustom) await backend.put('customSets', c.uid, c)
      if (settings) {
        if (settings.activeTeamUid && !existingTeams.has(settings.activeTeamUid))
          delete settings.activeTeamUid
        await backend.put('settings', SETTINGS_KEY, settings)
      }
      return {
        teams: acceptedTeams.length,
        customSets: acceptedCustom.length,
        settings: settings !== undefined,
        skipped,
      }
    },
  }
  return repo
}

let shared: Promise<Repository> | undefined

/** App-wide repository (IndexedDB, falling back to localStorage). */
export function getRepository(): Promise<Repository> {
  shared ??= openBackend().then(createRepository)
  return shared
}

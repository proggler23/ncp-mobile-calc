import { openDB } from 'idb'
import type { IDBPDatabase, IDBPTransaction } from 'idb'

export type StoreName = 'teams' | 'customSets' | 'settings'
const STORES: StoreName[] = ['teams', 'customSets', 'settings']

/** Minimal key-value contract implemented by IndexedDB and localStorage. Values are untrusted. */
export interface Backend {
  readonly kind: 'indexeddb' | 'localstorage'
  getAll(store: StoreName): Promise<unknown[]>
  get(store: StoreName, key: string): Promise<unknown>
  put(store: StoreName, key: string, value: unknown): Promise<void>
  delete(store: StoreName, key: string): Promise<void>
  clear(store: StoreName): Promise<void>
}

export const DB_NAME = 'ncp-mobile-calc'
/** Bump when the stored shape changes and add an entry to MIGRATIONS. */
export const DB_VERSION = 1

type UpgradeTx = IDBPTransaction<unknown, string[], 'versionchange'>
type Migration = (db: IDBPDatabase<unknown>, tx: UpgradeTx) => void

/** Migration N upgrades the schema from version N-1 to N. */
export const MIGRATIONS: Record<number, Migration> = {
  1: (db) => {
    for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s)
  },
}

export async function openIdbBackend(dbName = DB_NAME): Promise<Backend> {
  const db = await openDB<unknown>(dbName, DB_VERSION, {
    upgrade(database, oldVersion, newVersion, tx) {
      for (let v = oldVersion + 1; v <= (newVersion ?? DB_VERSION); v++)
        MIGRATIONS[v]?.(database, tx)
    },
  })
  return {
    kind: 'indexeddb',
    getAll: (s) => db.getAll(s),
    get: (s, k) => db.get(s, k),
    put: async (s, k, v) => {
      await db.put(s, v, k)
    },
    delete: (s, k) => db.delete(s, k),
    clear: (s) => db.clear(s),
  }
}

const LS_PREFIX = 'ncp:'
const LS_VERSION_KEY = `${LS_PREFIX}schemaVersion`

/** Migration hook for the localStorage fallback (same numbering as MIGRATIONS). */
export const LOCAL_MIGRATIONS: Record<number, (ls: Storage) => void> = {
  1: () => {},
}

export function createLocalStorageBackend(ls: Storage = globalThis.localStorage): Backend {
  const stored = Number(ls.getItem(LS_VERSION_KEY) ?? 0)
  const from = Number.isInteger(stored) && stored >= 0 ? stored : 0
  for (let v = from + 1; v <= DB_VERSION; v++) LOCAL_MIGRATIONS[v]?.(ls)
  if (from !== DB_VERSION) ls.setItem(LS_VERSION_KEY, String(DB_VERSION))

  const read = (s: StoreName): Record<string, unknown> => {
    try {
      const v: unknown = JSON.parse(ls.getItem(LS_PREFIX + s) ?? '{}')
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  const write = (s: StoreName, o: Record<string, unknown>) =>
    ls.setItem(LS_PREFIX + s, JSON.stringify(o))

  return {
    kind: 'localstorage',
    getAll: async (s) => Object.values(read(s)),
    get: async (s, k) => {
      const o = read(s)
      return Object.hasOwn(o, k) ? o[k] : undefined
    },
    put: async (s, k, v) => {
      const o = read(s)
      o[k] = v
      write(s, o)
    },
    delete: async (s, k) => {
      const o = read(s)
      delete o[k]
      write(s, o)
    },
    clear: async (s) => {
      ls.removeItem(LS_PREFIX + s)
    },
  }
}

/** IndexedDB when usable, otherwise localStorage. */
export async function openBackend(
  opts: { dbName?: string; forceLocalStorage?: boolean } = {},
): Promise<Backend> {
  if (!opts.forceLocalStorage && typeof indexedDB !== 'undefined') {
    try {
      return await openIdbBackend(opts.dbName)
    } catch {
      // private mode / blocked / quota: fall through to localStorage
    }
  }
  return createLocalStorageBackend()
}

import type { DexFile, GenData, GenId, Learnsets, SetsFile } from './types'
import { GEN_IDS } from './types'

export * from './types'
export * from './normalize'

type Loader<T> = () => Promise<{ default: T }>

// import.meta.glob keeps each JSON as its own lazily loaded chunk (code-split per generation).
const dexLoaders = import.meta.glob<{ default: DexFile }>('./generated/*/dex.json')
const learnsetLoaders = import.meta.glob<{ default: Learnsets }>('./generated/*/learnsets.json')
const setLoaders = import.meta.glob<{ default: SetsFile }>('./generated/*/sets.json')

function pick<T>(loaders: Record<string, Loader<T>>, gen: GenId, file: string): Loader<T> {
  const loader = loaders[`./generated/${gen}/${file}`]
  if (!loader) throw new Error(`No generated data for "${gen}" (${file}). Run npm run build:data.`)
  return loader
}

export function isGenId(s: string): s is GenId {
  return (GEN_IDS as readonly string[]).includes(s)
}

const cache = new Map<GenId, Promise<GenData>>()
const setsCache = new Map<GenId, Promise<SetsFile>>()

/** Load (and cache) one generation's entity data + learnsets. Common sets load on demand. */
export function loadGenData(gen: GenId): Promise<GenData> {
  let p = cache.get(gen)
  if (!p) {
    p = (async () => {
      const [dex, learnsets] = await Promise.all([
        pick(dexLoaders, gen, 'dex.json')(),
        pick(learnsetLoaders, gen, 'learnsets.json')(),
      ])
      return {
        ...dex.default,
        learnsets: learnsets.default,
        loadSets: () => loadSets(gen),
      }
    })()
    p.catch(() => cache.delete(gen))
    cache.set(gen, p)
  }
  return p
}

/**
 * Fetches every data chunk of a generation (used by "download for offline"). The service worker
 * caches the responses; the parsed modules are only kept by the module registry.
 */
export async function prefetchGenData(gen: GenId): Promise<void> {
  await Promise.all([
    pick(dexLoaders, gen, 'dex.json')(),
    pick(learnsetLoaders, gen, 'learnsets.json')(),
    pick(setLoaders, gen, 'sets.json')(),
  ])
}

export function loadSets(gen: GenId): Promise<SetsFile> {
  let p = setsCache.get(gen)
  if (!p) {
    p = pick(setLoaders, gen, 'sets.json')().then((m) => m.default)
    p.catch(() => setsCache.delete(gen))
    setsCache.set(gen, p)
  }
  return p
}

/** True if `speciesId` can learn `moveId` in this generation's data. */
export function canLearn(data: Pick<GenData, 'learnsets'>, speciesId: string, moveId: string) {
  return data.learnsets[speciesId]?.includes(moveId) ?? false
}

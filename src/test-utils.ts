import { GEN_IDS } from './data/types'
import { flushMatchup, resetStore } from './state/app'
import { resetSupportNudge } from './state/supportNudge'
import { getRepository } from './storage'

/** Pristine storage + store for UI tests (the IndexedDB connection is shared per test file). */
export async function resetAll(settings: { gen: 'sv' | 'champions'; lang?: 'en' | 'de' }) {
  localStorage.clear()
  await flushMatchup()
  const repo = await getRepository()
  await repo.importBackup(
    JSON.stringify({ app: 'ncp-mobile-calc', version: 1, teams: [], customSets: [] }),
    'replace',
  )
  for (const g of GEN_IDS) await repo.setMatchup(g, { savedAt: 1 })
  await repo.setActiveTeam(undefined)
  await repo.setSettings({
    gen: settings.gen,
    format: 'doubles',
    lang: settings.lang ?? 'en',
    supportNudge: undefined,
    menuSeen: undefined,
  })
  resetStore()
  resetSupportNudge()
}

import versionInfo from './generated/version.json'

/**
 * Provenance of the bundled game data. Written by `npm run build:data` / `npm run ncp:sync`
 * (scripts/build-data/version.ts) into generated/version.json.
 */
export interface DataVersionInfo {
  /** Commit SHA of the vendored upstream NCP VGC Damage Calculator (vendor/ncp/UPSTREAM.md) */
  ncpSha: string
  /** ISO timestamp the vendored NCP files were last synced from upstream */
  ncpSyncedAt: string
  /** Exact `pokemon-showdown` npm version used to generate the entity data */
  showdownVersion: string
  /** Smogon usage months (YYYY-MM) behind each generation's common sets (frozen gens included) */
  usageMonths: Record<string, string[]>
  /** Date (YYYY-MM-DD) the German names snapshot was built from PokeAPI */
  namesSnapshotDate: string
  /** ISO timestamp of the last data build that changed anything */
  builtAt: string
}

export function getDataVersionInfo(): DataVersionInfo {
  return versionInfo as DataVersionInfo
}

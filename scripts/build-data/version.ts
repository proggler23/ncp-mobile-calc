/**
 * Writes src/data/generated/version.json (provenance shown in the app later).
 * Standalone: `npm run build:version`; also called by build:data and ncp:sync.
 * builtAt only moves when something else in the file changed, so no-op refreshes stay no-ops.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DataVersionInfo } from '../../src/data/version'
import type { RegulationsFile, SetsFile } from '../../src/data/types'
import { parseUpstreamMd } from '../ncp-sync/upstream-md'
import { SNAPSHOT_FILE } from './names'
import type { NamesFile } from './names'

const ROOT = path.resolve(import.meta.dirname, '../..')
export const GENERATED = path.join(ROOT, 'src/data/generated')
export const VERSION_FILE = path.join(GENERATED, 'version.json')

export async function showdownVersion(): Promise<string> {
  const p = path.join(ROOT, 'node_modules/pokemon-showdown/package.json')
  return (JSON.parse(await readFile(p, 'utf8')) as { version: string }).version
}

/** Distinct usage months (YYYY-MM) in a sets file, ascending. */
export function usageMonthsOf(sets: SetsFile): string[] {
  const months = new Set<string>()
  for (const list of Object.values(sets)) {
    for (const s of list) if (/^\d{4}-\d{2}$/.test(s.month)) months.add(s.month)
  }
  return [...months].sort()
}

export async function collectVersion(builtAt: string): Promise<DataVersionInfo> {
  const up = parseUpstreamMd(await readFile(path.join(ROOT, 'vendor/ncp/UPSTREAM.md'), 'utf8'))
  const names = JSON.parse(await readFile(SNAPSHOT_FILE, 'utf8')) as NamesFile
  const usageMonths: Record<string, string[]> = {}
  for (const d of (await readdir(GENERATED, { withFileTypes: true })).filter((e) =>
    e.isDirectory(),
  )) {
    const sets = JSON.parse(
      await readFile(path.join(GENERATED, d.name, 'sets.json'), 'utf8'),
    ) as SetsFile
    usageMonths[d.name] = usageMonthsOf(sets)
  }
  const regulations: NonNullable<DataVersionInfo['regulations']> = {}
  for (const d of (await readdir(GENERATED, { withFileTypes: true })).filter((e) =>
    e.isDirectory(),
  )) {
    let file: RegulationsFile
    try {
      file = JSON.parse(
        await readFile(path.join(GENERATED, d.name, 'regulations.json'), 'utf8'),
      ) as RegulationsFile
    } catch {
      continue
    }
    regulations[d.name] = Object.fromEntries(
      file.regulations.map((r) => [
        r.id,
        {
          source: r.source,
          ...(r.showdownFormat ? { showdownFormat: r.showdownFormat } : {}),
          ...(r.verified !== undefined ? { verified: r.verified } : {}),
        },
      ]),
    )
  }
  return {
    ncpSha: up.sha,
    ncpSyncedAt: up.syncedAt,
    showdownVersion: await showdownVersion(),
    usageMonths: Object.fromEntries(
      Object.entries(usageMonths).sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
    regulations: Object.fromEntries(
      Object.entries(regulations).sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
    namesSnapshotDate: names.meta?.date ?? '',
    builtAt,
  }
}

/** True when the file was (re)written. */
export async function writeVersionJson(now = new Date()): Promise<boolean> {
  let prev: DataVersionInfo | undefined
  try {
    prev = JSON.parse(await readFile(VERSION_FILE, 'utf8')) as DataVersionInfo
  } catch {
    /* first run */
  }
  const next = await collectVersion(prev?.builtAt ?? now.toISOString())
  if (prev) {
    const strip = (v: DataVersionInfo) => JSON.stringify({ ...v, builtAt: '' })
    if (strip(prev) === strip(next)) return false
    next.builtAt = now.toISOString()
  }
  await writeFile(VERSION_FILE, JSON.stringify(next, null, 2) + '\n')
  return true
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log((await writeVersionJson()) ? 'version.json updated' : 'version.json unchanged')
}

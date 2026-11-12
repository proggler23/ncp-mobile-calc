/**
 * Share-id table checks (offline): every committed table is well formed and up to date with the
 * dex, and - given a git baseline - no existing id changed its number.
 */
import { execFileSync } from 'node:child_process'
import { currentFor, GEN_IDS, readTable, ROOT, tableRel } from '../build-share-ids/lib'
import { missingIds, tableChanges, tableErrors, type IdTable } from '../build-share-ids/tables'

export function baselineTable(gen: string, ref: string): IdTable | undefined {
  try {
    const text = execFileSync('git', ['show', `${ref}:${tableRel(gen)}`], {
      cwd: ROOT,
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString()
    return JSON.parse(text) as IdTable
  } catch {
    return undefined
  }
}

/** Errors that make the committed tables unusable (missing, malformed, stale). */
export function shareIdErrors(): string[] {
  const errors: string[] = []
  for (const gen of GEN_IDS) {
    const t = readTable(gen)
    if (!t) {
      errors.push(`share ids: ${tableRel(gen)} missing (run npm run build:share-ids)`)
      continue
    }
    for (const e of tableErrors(t)) errors.push(`share ids ${gen}: ${e}`)
    const missing = missingIds(t, currentFor(gen))
    if (missing.length)
      errors.push(
        `share ids ${gen}: ${missing.length} id(s) not in the table, e.g. ${missing.slice(0, 3).join(', ')} (run npm run build:share-ids)`,
      )
  }
  return errors
}

/** Existing mappings that changed against a git ref (breaks old links). */
export function shareIdChanges(ref: string): string[] {
  const out: string[] = []
  for (const gen of GEN_IDS) {
    const t = readTable(gen)
    const base = baselineTable(gen, ref)
    if (t && base) for (const p of tableChanges(base, t)) out.push(`${gen}: ${p}`)
  }
  return out
}

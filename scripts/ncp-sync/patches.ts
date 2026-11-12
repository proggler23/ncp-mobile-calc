/**
 * Patch layer: vendor/ncp-patches/*.patch are unified diffs (git format, `a/script_res/x.js`
 * paths relative to the upstream repo root) applied, in file-name order, on top of the vendored
 * upstream files after every sync. See docs/MAINTENANCE.md ("NCP patches").
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export function listPatches(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.patch'))
    .sort()
}

export interface ApplyResult {
  ok: boolean
  message: string
}

/** Apply (or reverse) one patch inside `root` (an upstream-layout directory). */
export function gitApply(
  root: string,
  patchFile: string,
  opts: { check?: boolean; reverse?: boolean } = {},
): ApplyResult {
  const args = ['apply', '--whitespace=nowarn', '-p1']
  if (opts.check) args.push('--check')
  if (opts.reverse) args.push('-R')
  args.push(path.resolve(patchFile))
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  return { ok: r.status === 0, message: `${r.stderr ?? ''}${r.stdout ?? ''}`.trim() }
}

/**
 * Apply all patches in order to `root`. Stops at the first failure.
 * Returns names applied and the failure (if any).
 */
export function applyPatches(
  root: string,
  patchDir: string,
): { applied: string[]; failed?: { name: string; message: string } } {
  const applied: string[] = []
  for (const name of listPatches(patchDir)) {
    const file = path.join(patchDir, name)
    const check = gitApply(root, file, { check: true })
    if (!check.ok) return { applied, failed: { name, message: check.message } }
    const res = gitApply(root, file)
    if (!res.ok) return { applied, failed: { name, message: res.message } }
    applied.push(name)
  }
  return { applied }
}

/**
 * Verify the vendored tree currently contains all patches: reverse-apply them (last first) on a
 * temporary copy. Returns the names that no longer match.
 */
export function verifyPatchesApplied(vendorDir: string, patchDir: string): string[] {
  const names = listPatches(patchDir)
  if (!names.length) return []
  const tmp = mkdtempSync(path.join(tmpdir(), 'ncp-patch-'))
  try {
    cpSync(vendorDir, tmp, { recursive: true })
    const bad: string[] = []
    for (const name of [...names].reverse()) {
      const r = gitApply(tmp, path.join(patchDir, name), { reverse: true })
      if (!r.ok) bad.push(name)
    }
    return bad.reverse()
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

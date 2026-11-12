/**
 * NCP upstream sync.
 *
 *   npm run ncp:sync                 sync if upstream main moved (no-op otherwise)
 *   npm run ncp:sync -- --detect     only report whether upstream moved (sets `changed` output)
 *   npm run ncp:sync -- --force      re-vendor even when the SHA is unchanged
 *   npm run ncp:sync -- --dry-run    analyse only; leave the working tree untouched
 *   npm run ncp:sync -- --upstream <dir>   use a local clone instead of cloning (read-only copy)
 *   npm run ncp:sync -- --no-golden  skip the (slow) golden re-capture
 *   npm run ncp:sync -- --check-patches    verify vendor/ncp-patches are applied to vendor/ncp
 *
 * Writes .cache/ncp-sync/result.json in the gate format (pass | anomaly | fail); feed it to
 * `npm run check:data -- --merge .cache/ncp-sync/result.json`. Exit code is 0 unless the sync
 * itself crashed. The upstream clone is untrusted data: it is only copied and served as static
 * files to the headless browser, never executed in Node.
 */
import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { goldenReasons, makeResult } from '../check-data/gates'
import type { Reason } from '../check-data/gates'
import { writeVersionJson } from '../build-data/version'
import {
  CACHE,
  GOLDEN_DIR,
  PAGES,
  PATCH_DIR,
  ROOT,
  UPSTREAM_BRANCH,
  UPSTREAM_MD,
  UPSTREAM_REPO,
  VENDOR_DIR,
} from './config'
import { analyzeStructure, compareGoldens, planSync, sha256 } from './lib'
import type { GoldenScenario } from './lib'
import { applyPatches, listPatches, verifyPatchesApplied } from './patches'
import { parseUpstreamMd, renderUpstreamMd } from './upstream-md'

const argv = process.argv.slice(2)
const flag = (n: string) => argv.includes(n)
const opt = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined)
const RESULT = path.join(CACHE, 'result.json')

function sh(cmd: string, args: string[], cwd = ROOT, extraEnv: NodeJS.ProcessEnv = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    env: { ...process.env, ...extraEnv },
  })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}
const tail = (s: string, n = 6) => s.split('\n').slice(-n).join(' / ').slice(0, 500)

function output(key: string, value: string) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
}

function finish(reasons: Reason[], notes: string[], metrics: Record<string, unknown>) {
  const result = makeResult({ reasons, notes, checks: [], metrics: { ncpSync: metrics } })
  mkdirSync(CACHE, { recursive: true })
  writeFileSync(RESULT, JSON.stringify(result, null, 2) + '\n')
  console.log(`ncp:sync result: ${result.status}`)
  for (const r of reasons) console.log(`  - ${r.level} ${r.code}: ${r.message}`)
  for (const n of notes) console.log(`  . ${n}`)
  output('ncp_status', result.status)
}

function readGoldens(dir: string): GoldenScenario[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /^gen-.*\.json$/.test(f))
    .sort()
    .flatMap(
      (f) =>
        (JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { scenarios: GoldenScenario[] })
          .scenarios,
    )
}

async function main() {
  const pinned = parseUpstreamMd(readFileSync(UPSTREAM_MD, 'utf8'))

  if (flag('--check-patches')) {
    const bad = verifyPatchesApplied(VENDOR_DIR, PATCH_DIR)
    const names = listPatches(PATCH_DIR)
    if (bad.length) {
      console.error(`Patches not applied to vendor/ncp: ${bad.join(', ')}`)
      process.exit(1)
    }
    console.log(`OK: ${names.length} patch(es) applied to vendor/ncp`)
    return
  }

  // 1. has upstream moved?
  const localClone = opt('--upstream')
  const plan = await planSync({
    readUpstreamMd: () => readFileSync(UPSTREAM_MD, 'utf8'),
    getRemoteSha: () => {
      if (localClone) {
        const r = sh('git', ['-C', path.resolve(localClone), 'rev-parse', 'HEAD'])
        if (!r.ok) throw new Error(`--upstream is not a git clone: ${r.out}`)
        return r.out
      }
      const r = sh('git', ['ls-remote', UPSTREAM_REPO, `refs/heads/${UPSTREAM_BRANCH}`])
      const sha = r.out.split(/\s+/)[0] ?? ''
      if (!r.ok || !sha) throw new Error(`git ls-remote failed: ${r.out}`)
      return sha
    },
  })
  console.log(
    `pinned ${plan.pinnedSha}\nremote ${plan.remoteSha} -> ${plan.changed ? 'CHANGED' : 'unchanged'}`,
  )
  output('changed', String(plan.changed || flag('--force')))
  if (flag('--detect')) return
  if (!plan.changed && !flag('--force')) {
    finish([], [`Upstream NCP unchanged (${plan.pinnedSha.slice(0, 10)}); nothing to sync.`], {
      changed: false,
      sha: plan.pinnedSha,
    })
    return
  }

  const reasons: Reason[] = []
  const notes: string[] = []
  const metrics: Record<string, unknown> = {
    changed: true,
    from: plan.pinnedSha,
    to: plan.remoteSha,
  }
  const dry = flag('--dry-run')

  // 2. fetch upstream into a cache dir (never the project tree)
  const work = path.join(CACHE, 'work')
  rmSync(work, { recursive: true, force: true })
  mkdirSync(CACHE, { recursive: true })
  if (localClone) cpSync(path.resolve(localClone), work, { recursive: true })
  else {
    const r = sh('git', ['clone', '--depth', '1', '--branch', UPSTREAM_BRANCH, UPSTREAM_REPO, work])
    if (!r.ok) throw new Error(`clone failed: ${r.out}`)
  }
  const sha = sh('git', ['-C', work, 'rev-parse', 'HEAD']).out
  const commitDate = sh('git', ['-C', work, 'log', '-1', '--format=%cs']).out

  // 3. structural analysis against the vendored file list
  const vendored = Object.keys(pinned.hashes)
  const structure = analyzeStructure({
    vendored,
    pages: Object.fromEntries(
      PAGES.map((p) => [
        p,
        existsSync(path.join(work, p)) ? readFileSync(path.join(work, p), 'utf8') : null,
      ]),
    ),
    exists: (rel) => existsSync(path.join(work, rel)),
  })
  reasons.push(...structure.reasons)
  metrics.structure = {
    missing: structure.missing,
    unreferenced: structure.unreferenced,
    added: structure.added,
  }
  if (structure.missing.length) {
    notes.push('Vendored files are missing upstream: nothing was re-vendored (manual work needed).')
    finish(reasons, notes, metrics)
    return
  }

  // 4. hashes of the pristine upstream files, then the patch layer (applied to the work copy so
  // that the re-captured goldens describe the patched engine)
  const hashes = Object.fromEntries(
    vendored.map((f) => [f, sha256(readFileSync(path.join(work, f)))]),
  )
  const patched = applyPatches(work, PATCH_DIR)
  if (patched.failed) {
    reasons.push({
      level: 'anomaly',
      code: 'ncp-patch-failed',
      message: `patch ${patched.failed.name} no longer applies to upstream ${sha.slice(0, 10)}: ${tail(patched.failed.message, 3)}`,
    })
  }
  metrics.patches = patched.applied

  if (dry) {
    notes.push('--dry-run: working tree untouched.')
    finish(reasons, notes, metrics)
    return
  }

  // 5. re-vendor
  for (const f of vendored) {
    mkdirSync(path.dirname(path.join(VENDOR_DIR, f)), { recursive: true })
    cpSync(path.join(work, f), path.join(VENDOR_DIR, f))
  }
  if (existsSync(path.join(work, 'LICENSE')))
    cpSync(path.join(work, 'LICENSE'), path.join(VENDOR_DIR, 'LICENSE'))
  writeFileSync(
    UPSTREAM_MD,
    renderUpstreamMd({
      sha,
      commitDate,
      syncedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      hashes,
      patches: patched.applied,
    }),
  )

  // 6. bridge maps (this also proves the vendored scripts still load in the engine sandbox)
  const bridge = sh('npx', ['tsx', 'scripts/build-bridge/index.ts'])
  if (!bridge.ok) {
    reasons.push({
      level: 'anomaly',
      code: 'ncp-loader-failed',
      message: `bridge build / sandbox loader failed on the new scripts: ${tail(bridge.out)}`,
    })
  }

  // 7. golden re-capture against the new upstream (Playwright), compared with the old goldens
  if (!flag('--no-golden')) {
    const out = path.join(CACHE, 'golden-new')
    rmSync(out, { recursive: true, force: true })
    const cap = sh('node', ['scripts/ncp-golden/capture.mjs', '--upstream', work, '--out', out])
    const next = readGoldens(out)
    if (!cap.ok || !next.length) {
      reasons.push({
        level: 'anomaly',
        code: 'golden-capture-failed',
        message: `golden capture reported failures: ${tail(cap.out, 8)}`,
      })
    }
    if (next.length) {
      const diff = compareGoldens(readGoldens(GOLDEN_DIR), next)
      metrics.golden = {
        total: diff.total,
        changed: diff.changed.length,
        removed: diff.removed.length,
        added: diff.added.length,
        changedPct: Math.round(diff.changedFraction * 1000) / 10,
        examples: diff.changed.slice(0, 10),
      }
      notes.push(
        `Golden scenarios: ${diff.total} previous, ${diff.changed.length} changed, ${diff.removed.length} removed, ${diff.added.length} added (${(diff.changedFraction * 100).toFixed(1)}% changed).`,
      )
      reasons.push(...goldenReasons(diff.changedFraction))
      for (const f of readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.json')))
        rmSync(path.join(GOLDEN_DIR, f))
      for (const f of readdirSync(out)) cpSync(path.join(out, f), path.join(GOLDEN_DIR, f))
    }
  }

  await writeVersionJson()
  finish(reasons, notes, metrics)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

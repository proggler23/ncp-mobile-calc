/**
 * Validation gates for generated data (and optionally the whole repo).
 *
 *   npm run check:data                      schema + count deltas + bridge coverage diff
 *   npm run check:data -- --full            ... then lint, typecheck, tests (incl. goldens), build
 *   npm run check:data -- --merge a.json    fold in another result (e.g. ncp-sync) into the verdict
 *   options: --base <git ref> (default HEAD)  --out <dir> (default .cache/check-data)  --no-bridge
 *
 * Writes <out>/result.json (status pass|anomaly|fail + reasons) and <out>/result.md.
 * Exit code 1 only for `fail`; sets `status` in $GITHUB_OUTPUT when running in Actions.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import {
  compareCounts,
  compareCoverage,
  comparePopularCounts,
  compareRegulationCounts,
  makeResult,
  mergeResults,
  renderMarkdown,
} from './gates'
import type { CheckResult, Coverage, CountMap, GateResult, Reason } from './gates'
import { countsOf, popularCountsOf, regulationCountsOf, validateGen, VersionSchema } from './schema'
import { GENS } from '../build-data/config'
import type { Files, RegulationCounts } from './schema'

const ROOT = path.resolve(import.meta.dirname, '../..')
const GENERATED = 'src/data/generated'
const COVERAGE = 'src/bridge/generated/coverage.json'

const argv = process.argv.slice(2)
const flag = (n: string) => argv.includes(n)
const opt = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined)
const BASE = opt('--base') ?? 'HEAD'
const OUT = path.resolve(ROOT, opt('--out') ?? '.cache/check-data')

const readJson = (rel: string): unknown => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'))

function gitShow(rel: string): unknown | undefined {
  try {
    const text = execFileSync('git', ['show', `${BASE}:${rel}`], {
      cwd: ROOT,
      maxBuffer: 1 << 30,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString()
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const genDirs = () =>
  readdirSync(path.join(ROOT, GENERATED), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

function run(name: string, cmd: string, args: string[], env: NodeJS.ProcessEnv = {}): CheckResult {
  const t0 = Date.now()
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 1 << 28,
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const secs = ((Date.now() - t0) / 1000).toFixed(0)
  if (r.status === 0) return { name, status: 'pass', detail: `${secs}s` }
  const tail = out.trim().split('\n').slice(-6).join(' / ').slice(0, 400)
  return { name, status: 'fail', detail: `exit ${r.status} after ${secs}s: ${tail}` }
}

function main() {
  const reasons: Reason[] = []
  const notes: string[] = []
  const checks: CheckResult[] = []
  const metrics: Record<string, unknown> = {}

  // 1. schema + referential validation of every gen (frozen gens included)
  const cur: CountMap = {}
  const curReg: Record<string, RegulationCounts> = {}
  const curPop: Record<string, number> = {}
  const schemaErrors: string[] = []
  const gens = genDirs()
  for (const gen of gens) {
    const regFile = `${GENERATED}/${gen}/regulations.json`
    const popFile = `${GENERATED}/${gen}/popular.json`
    const files: Files = {
      dex: readJson(`${GENERATED}/${gen}/dex.json`),
      learnsets: readJson(`${GENERATED}/${gen}/learnsets.json`),
      sets: readJson(`${GENERATED}/${gen}/sets.json`),
      ...(existsSync(path.join(ROOT, regFile)) ? { regulations: readJson(regFile) } : {}),
      ...(existsSync(path.join(ROOT, popFile)) ? { popular: readJson(popFile) } : {}),
    }
    for (const [rid, n] of Object.entries(popularCountsOf(files.popular)))
      curPop[`${gen}/${rid}`] = n
    // config.ts names Smogon usage for a regulation -> popular.json must have it
    for (const w of GENS.find((g) => g.id === gen)?.regulations ?? [])
      if (w.usage && !(`${gen}/${w.id}` in curPop))
        schemaErrors.push(`${gen}/popular.json: regulation "${w.id}" (config.ts usage) is missing`)
    // config.ts lists regulations for this gen -> the file must exist with exactly those ids
    const wanted = GENS.find((g) => g.id === gen)?.regulations?.map((r) => r.id) ?? []
    const have = regulationCountsOf(files.regulations)
    for (const w of wanted)
      if (!(w in have))
        schemaErrors.push(`${gen}/regulations.json: regulation "${w}" (config.ts) is missing`)
    for (const [rid, c] of Object.entries(have)) {
      curReg[`${gen}/${rid}`] = c
    }
    const v = validateGen(gen, files)
    schemaErrors.push(...v.errors)
    for (const w of v.warnings) notes.push(`data quirk: ${w}`)
    cur[gen] = countsOf(files)
  }
  const version = VersionSchema.safeParse(readJson(`${GENERATED}/version.json`))
  if (!version.success)
    schemaErrors.push(`version.json: ${version.error.issues.map((i) => i.message).join('; ')}`)
  for (const e of schemaErrors) reasons.push({ level: 'fail', code: 'schema', message: e })
  checks.push({
    name: 'schema',
    status: schemaErrors.length ? 'fail' : 'pass',
    detail: `${gens.length} gens validated`,
  })

  // 2. count deltas vs the previous committed snapshot
  const prev: CountMap = {}
  for (const gen of gens) {
    const dex = gitShow(`${GENERATED}/${gen}/dex.json`)
    if (!dex) continue
    prev[gen] = countsOf({
      dex,
      learnsets: gitShow(`${GENERATED}/${gen}/learnsets.json`),
      sets: gitShow(`${GENERATED}/${gen}/sets.json`),
    })
  }
  if (Object.keys(prev).length) {
    const { reasons: r, deltas } = compareCounts(prev, cur)
    reasons.push(...r)
    metrics.countDeltas = deltas
    checks.push({
      name: 'count-delta',
      status: r.some((x) => x.level === 'fail') ? 'fail' : r.length ? 'anomaly' : 'pass',
      detail: `vs ${BASE}`,
    })
    // legal pools of the regulations (only compared when the baseline already had them)
    const prevReg: Record<string, RegulationCounts> = {}
    for (const gen of gens) {
      const base = gitShow(`${GENERATED}/${gen}/regulations.json`)
      for (const [rid, c] of Object.entries(regulationCountsOf(base))) prevReg[`${gen}/${rid}`] = c
    }
    if (Object.keys(prevReg).length) {
      const rr = compareRegulationCounts(prevReg, curReg)
      reasons.push(...rr.reasons)
      metrics.regulationDeltas = rr.deltas
      checks.push({
        name: 'regulation-count-delta',
        status: rr.reasons.some((x) => x.level === 'fail')
          ? 'fail'
          : rr.reasons.length
            ? 'anomaly'
            : 'pass',
        detail: `${Object.keys(curReg).length} regulations vs ${BASE}`,
      })
    }
    // species with popular data per regulation (only compared when the baseline already had them)
    const prevPop: Record<string, number> = {}
    for (const gen of gens)
      for (const [rid, n] of Object.entries(
        popularCountsOf(gitShow(`${GENERATED}/${gen}/popular.json`)),
      ))
        prevPop[`${gen}/${rid}`] = n
    if (Object.keys(prevPop).length) {
      const pr = comparePopularCounts(prevPop, curPop)
      reasons.push(...pr.reasons)
      metrics.popularDeltas = pr.deltas
      checks.push({
        name: 'popular-count-delta',
        status: pr.reasons.some((x) => x.level === 'fail')
          ? 'fail'
          : pr.reasons.length
            ? 'anomaly'
            : 'pass',
        detail: `${Object.keys(curPop).length} regulations vs ${BASE}`,
      })
    }
  } else {
    notes.push(`No committed snapshot at ${BASE}; count-delta check skipped.`)
  }
  metrics.counts = cur
  metrics.regulationCounts = curReg
  metrics.popularCounts = curPop

  // 3. bridge coverage diff (the bridge build is offline and deterministic)
  if (!flag('--no-bridge')) {
    const b = run('bridge-build', 'npx', ['tsx', 'scripts/build-bridge/index.ts'])
    if (b.status === 'fail') {
      reasons.push({
        level: 'fail',
        code: 'bridge-build',
        message: `build:bridge failed: ${b.detail}`,
      })
      checks.push(b)
    } else if (existsSync(path.join(ROOT, COVERAGE))) {
      const before = gitShow(COVERAGE) as Coverage | undefined
      const after = readJson(COVERAGE) as Coverage
      if (before) {
        const r = compareCoverage(before, after)
        reasons.push(...r)
        checks.push({
          name: 'bridge-coverage',
          status: r.length ? 'anomaly' : 'pass',
          detail: `vs ${BASE}`,
        })
      } else {
        notes.push(`No committed ${COVERAGE} at ${BASE}; bridge coverage diff skipped.`)
        checks.push({ name: 'bridge-coverage', status: 'pass', detail: 'no baseline' })
      }
    }
  }

  // 4. informational: German names that fell back to English
  const reportFile = path.join(ROOT, '.cache/build-data/report.json')
  if (existsSync(reportFile)) {
    const report = JSON.parse(readFileSync(reportFile, 'utf8')) as Record<
      string,
      { missing?: Record<string, string[]> }
    >
    for (const [gen, r] of Object.entries(report)) {
      for (const [kind, list] of Object.entries(r.missing ?? {})) {
        if (list.length)
          notes.push(
            `German name missing (English fallback) in ${gen}/${kind}: ${list.length} - ${list.slice(0, 12).join(', ')}${list.length > 12 ? ', ...' : ''}`,
          )
      }
    }
  }
  try {
    const info = readJson(`${GENERATED}/sources.json`) as {
      gens?: Record<string, { usageFallback?: string }>
    }
    for (const [gen, g] of Object.entries(info.gens ?? {}))
      if (g.usageFallback)
        notes.push(`Usage stats unavailable for ${gen}; kept committed sets (${g.usageFallback}).`)
  } catch {
    /* ignore */
  }

  // 5. full repo checks
  if (flag('--full')) {
    checks.push(run('lint', 'npm', ['run', '--silent', 'lint']))
    checks.push(run('typecheck', 'npm', ['run', '--silent', 'typecheck']))
    checks.push(run('typecheck-scripts', 'npm', ['run', '--silent', 'typecheck:scripts']))
    checks.push(run('vendor checksums', 'npm', ['run', '--silent', 'check:vendor']))
    checks.push(run('test (incl. goldens)', 'npm', ['run', '--silent', 'test']))
    checks.push(run('build (offline)', 'npm', ['run', '--silent', 'build:offline']))
  }

  let result: GateResult = makeResult({ reasons, notes, checks, metrics })
  for (const m of argv.flatMap((a, i) => (a === '--merge' ? [argv[i + 1]!] : []))) {
    result = mergeResults([
      result,
      JSON.parse(readFileSync(path.resolve(ROOT, m), 'utf8')) as GateResult,
    ])
  }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  writeFileSync(path.join(OUT, 'result.md'), renderMarkdown(result))
  console.log(`\n${renderMarkdown(result)}`)
  console.log(`Gate result: ${result.status} (${path.join(OUT, 'result.json')})`)
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `status=${result.status}\n`)
  process.exitCode = result.status === 'fail' ? 1 : 0
}

main()

/** Pure / injectable logic of `npm run ncp:sync` (unit tested; no network, no spawning). */
import { createHash } from 'node:crypto'
import type { Reason } from '../check-data/gates'
import { IGNORED_REFS } from './config'
import { parseUpstreamMd } from './upstream-md'

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

// ------------------------------------------------------------------ change detection

export interface PlanDeps {
  /** content of vendor/ncp/UPSTREAM.md */
  readUpstreamMd: () => string | Promise<string>
  /** HEAD SHA of the upstream branch (git ls-remote / API) */
  getRemoteSha: () => string | Promise<string>
}
export interface SyncPlan {
  pinnedSha: string
  remoteSha: string
  changed: boolean
}

export async function planSync(deps: PlanDeps): Promise<SyncPlan> {
  const pinnedSha = parseUpstreamMd(await deps.readUpstreamMd()).sha
  const remoteSha = (await deps.getRemoteSha()).trim().toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(remoteSha)) throw new Error(`invalid upstream SHA "${remoteSha}"`)
  return { pinnedSha, remoteSha, changed: pinnedSha !== remoteSha }
}

// ------------------------------------------------------------------ structure analysis

/** <script src="..."> values in document order (query strings stripped). */
export function extractScriptRefs(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    out.push(m[1]!.split(/[?#]/)[0]!)
  }
  return out
}

export interface StructureInput {
  /** vendored files relative to the upstream root, e.g. script_res/pokedex.js */
  vendored: string[]
  /** page file name -> html (null when the page no longer exists upstream) */
  pages: Record<string, string | null>
  /** does this path exist in the new upstream checkout */
  exists: (rel: string) => boolean
  ignored?: RegExp[]
}
export interface StructureReport {
  reasons: Reason[]
  missing: string[]
  unreferenced: string[]
  added: string[]
}

/** Letters-only file stem, for the rename heuristic. */
const stem = (p: string) =>
  p
    .split('/')
    .pop()!
    .replace(/\.js$/, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase()
const similar = (a: string, b: string) => {
  const x = stem(a)
  const y = stem(b)
  return x.startsWith(y) || y.startsWith(x)
}

/** Detect added / removed / renamed engine scripts relative to the vendored list. */
export function analyzeStructure(input: StructureInput): StructureReport {
  const ignored = input.ignored ?? IGNORED_REFS
  const reasons: Reason[] = []
  const referenced = new Set<string>()
  for (const [page, html] of Object.entries(input.pages)) {
    if (html === null) {
      reasons.push({
        level: 'anomaly',
        code: 'ncp-page-missing',
        message: `upstream page ${page} no longer exists`,
      })
      continue
    }
    for (const ref of extractScriptRefs(html)) {
      if (!ignored.some((re) => re.test(ref))) referenced.add(ref)
    }
  }
  const vendored = new Set(input.vendored)
  const missing = input.vendored.filter((v) => !input.exists(v))
  const unreferenced = input.vendored.filter((v) => input.exists(v) && !referenced.has(v))
  const added = [...referenced].filter((r) => !vendored.has(r))

  for (const m of missing) {
    const guess = added.find((a) => similar(a, m))
    reasons.push({
      level: 'anomaly',
      code: 'ncp-file-removed',
      message: `vendored file ${m} no longer exists upstream${guess ? ` (renamed to ${guess}?)` : ''}`,
    })
  }
  for (const u of unreferenced) {
    reasons.push({
      level: 'anomaly',
      code: 'ncp-file-unreferenced',
      message: `vendored file ${u} is no longer loaded by any calculator page`,
    })
  }
  for (const a of added) {
    reasons.push({
      level: 'anomaly',
      code: 'ncp-file-added',
      message: `calculator pages load ${a}, which is neither vendored nor on the ignore list (scripts/ncp-sync/config.ts)`,
    })
  }
  return { reasons, missing, unreferenced, added }
}

// ------------------------------------------------------------------ golden comparison

export interface GoldenScenario {
  id: string
  resolved?: unknown
  expected?: unknown
}
export interface GoldenDiff {
  total: number
  changed: string[]
  removed: string[]
  added: string[]
  /** (changed + removed) / previous total */
  changedFraction: number
}

export function compareGoldens(prev: GoldenScenario[], next: GoldenScenario[]): GoldenDiff {
  const nextById = new Map(next.map((s) => [s.id, s]))
  const prevIds = new Set(prev.map((s) => s.id))
  const changed: string[] = []
  const removed: string[] = []
  for (const p of prev) {
    const n = nextById.get(p.id)
    if (!n) removed.push(p.id)
    else if (JSON.stringify([p.resolved, p.expected]) !== JSON.stringify([n.resolved, n.expected]))
      changed.push(p.id)
  }
  const added = next.filter((s) => !prevIds.has(s.id)).map((s) => s.id)
  const total = prev.length
  return {
    total,
    changed,
    removed,
    added,
    changedFraction: total ? (changed.length + removed.length) / total : 0,
  }
}

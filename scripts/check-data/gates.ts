/**
 * Pure gate logic for the data/NCP update pipeline (unit tested). Statuses:
 *   pass     - safe to auto-commit and deploy
 *   anomaly  - plausible but needs a human (workflow opens a PR instead of committing)
 *   fail     - broken (workflow fails, nothing is committed)
 */
import type { Counts, RegulationCounts } from './schema'

export type Status = 'pass' | 'anomaly' | 'fail'
export interface Reason {
  level: 'anomaly' | 'fail'
  code: string
  message: string
}
export interface CheckResult {
  name: string
  status: Status
  detail?: string
}
export interface GateResult {
  status: Status
  reasons: Reason[]
  /** informational, never affects the status */
  notes: string[]
  checks: CheckResult[]
  generatedAt: string
  metrics?: Record<string, unknown>
}

export const THRESHOLDS = {
  /** a count that drops by more than this fraction vs the committed snapshot is an anomaly */
  countDropAnomaly: 0.05,
  /** ... and a drop of at least this fraction is treated as broken output */
  countDropFail: 0.5,
  /** more than this fraction of golden scenarios with changed results is an anomaly */
  goldenChangedAnomaly: 0.1,
}

export type CountMap = Record<string, Counts>
const COUNT_KEYS: (keyof Counts)[] = ['species', 'moves', 'items', 'abilities', 'learnsets', 'sets']

/** Compare per-gen counts with the previous committed snapshot. */
export function compareCounts(
  prev: CountMap,
  cur: CountMap,
  t = THRESHOLDS,
): { reasons: Reason[]; deltas: Record<string, Partial<Record<keyof Counts, number>>> } {
  const reasons: Reason[] = []
  const deltas: Record<string, Partial<Record<keyof Counts, number>>> = {}
  for (const [gen, p] of Object.entries(prev)) {
    const c = cur[gen]
    if (!c) {
      reasons.push({
        level: 'fail',
        code: 'count-gen-missing',
        message: `${gen}: generation data disappeared`,
      })
      continue
    }
    for (const key of COUNT_KEYS) {
      if (p[key] <= 0) continue
      const drop = (p[key] - c[key]) / p[key]
      if (c[key] !== p[key]) (deltas[gen] ??= {})[key] = c[key] - p[key]
      if (drop <= t.countDropAnomaly) continue
      const pct = (drop * 100).toFixed(1)
      reasons.push({
        level: drop >= t.countDropFail ? 'fail' : 'anomaly',
        code: 'count-drop',
        message: `${gen}: ${key} dropped ${pct}% (${p[key]} -> ${c[key]}; threshold ${t.countDropAnomaly * 100}%)`,
      })
    }
  }
  return { reasons, deltas }
}

/**
 * Compare the legal-pool sizes of each regulation with the previous snapshot (same thresholds as
 * the dex counts). A regulation that disappeared fails, a new one is fine.
 * Keys are `<gen>/<regulation id>`.
 */
export function compareRegulationCounts(
  prev: Record<string, RegulationCounts>,
  cur: Record<string, RegulationCounts>,
  t = THRESHOLDS,
): { reasons: Reason[]; deltas: Record<string, Partial<RegulationCounts>> } {
  const reasons: Reason[] = []
  const deltas: Record<string, Partial<RegulationCounts>> = {}
  for (const [key, p] of Object.entries(prev)) {
    const c = cur[key]
    if (!c) {
      reasons.push({
        level: 'fail',
        code: 'regulation-missing',
        message: `${key}: regulation disappeared`,
      })
      continue
    }
    for (const k of ['species', 'items'] as const) {
      if (c[k] !== p[k]) (deltas[key] ??= {})[k] = c[k] - p[k]
      if (p[k] <= 0) continue
      const drop = (p[k] - c[k]) / p[k]
      if (drop <= t.countDropAnomaly) continue
      reasons.push({
        level: drop >= t.countDropFail ? 'fail' : 'anomaly',
        code: 'regulation-count-drop',
        message: `${key}: legal ${k} dropped ${(drop * 100).toFixed(1)}% (${p[k]} -> ${c[k]}; threshold ${t.countDropAnomaly * 100}%)`,
      })
    }
  }
  return { reasons, deltas }
}

/**
 * Compare the number of species with popular data per regulation with the previous snapshot (same
 * thresholds as the dex counts). Keys are `<gen>/<regulation id>`; a regulation that lost its data
 * fails, a new one is fine.
 */
export function comparePopularCounts(
  prev: Record<string, number>,
  cur: Record<string, number>,
  t = THRESHOLDS,
): { reasons: Reason[]; deltas: Record<string, number> } {
  const reasons: Reason[] = []
  const deltas: Record<string, number> = {}
  for (const [key, p] of Object.entries(prev)) {
    const c = cur[key]
    if (c === undefined) {
      reasons.push({
        level: 'fail',
        code: 'popular-missing',
        message: `${key}: popular data disappeared`,
      })
      continue
    }
    if (c !== p) deltas[key] = c - p
    if (p <= 0) continue
    const drop = (p - c) / p
    if (drop <= t.countDropAnomaly) continue
    reasons.push({
      level: drop >= t.countDropFail ? 'fail' : 'anomaly',
      code: 'popular-count-drop',
      message: `${key}: species with popular data dropped ${(drop * 100).toFixed(1)}% (${p} -> ${c}; threshold ${t.countDropAnomaly * 100}%)`,
    })
  }
  return { reasons, deltas }
}

/** gen -> kind -> unmatched names on each side (src/bridge/generated/coverage.json) */
export type Coverage = Record<string, Record<string, { ncpOnly: string[]; sdOnly: string[] }>>

/** New unmatched NCP<->Showdown entities relative to the previous coverage = anomaly. */
export function compareCoverage(prev: Coverage, cur: Coverage): Reason[] {
  const found: string[] = []
  for (const [gen, kinds] of Object.entries(cur)) {
    for (const [kind, c] of Object.entries(kinds)) {
      const p = prev[gen]?.[kind]
      const prevNcp = new Set(p?.ncpOnly ?? [])
      const prevSd = new Set(p?.sdOnly ?? [])
      for (const n of c.ncpOnly) if (!prevNcp.has(n)) found.push(`${gen}/${kind}: NCP-only "${n}"`)
      for (const n of c.sdOnly)
        if (!prevSd.has(n)) found.push(`${gen}/${kind}: Showdown-only "${n}"`)
    }
  }
  if (!found.length) return []
  return [
    {
      level: 'anomaly',
      code: 'bridge-new-unmatched',
      message: `${found.length} new unmatched NCP<->Showdown entit${found.length === 1 ? 'y' : 'ies'}: ${found.slice(0, 15).join('; ')}${found.length > 15 ? '; ...' : ''}`,
    },
  ]
}

export function goldenReasons(changedFraction: number, t = THRESHOLDS): Reason[] {
  if (changedFraction <= t.goldenChangedAnomaly) return []
  return [
    {
      level: 'anomaly',
      code: 'golden-changed',
      message: `${(changedFraction * 100).toFixed(1)}% of golden scenarios changed (threshold ${t.goldenChangedAnomaly * 100}%)`,
    },
  ]
}

export function statusOf(reasons: Reason[], checks: CheckResult[] = []): Status {
  if (reasons.some((r) => r.level === 'fail') || checks.some((c) => c.status === 'fail'))
    return 'fail'
  if (reasons.some((r) => r.level === 'anomaly') || checks.some((c) => c.status === 'anomaly'))
    return 'anomaly'
  return 'pass'
}

export function makeResult(
  parts: Pick<GateResult, 'reasons' | 'notes' | 'checks'> & { metrics?: Record<string, unknown> },
  now = new Date(),
): GateResult {
  return {
    status: statusOf(parts.reasons, parts.checks),
    reasons: parts.reasons,
    notes: parts.notes,
    checks: parts.checks,
    generatedAt: now.toISOString(),
    ...(parts.metrics ? { metrics: parts.metrics } : {}),
  }
}

/** Combine several results (e.g. data gate + ncp-sync result). Worst status wins. */
export function mergeResults(results: GateResult[], now = new Date()): GateResult {
  return makeResult(
    {
      reasons: results.flatMap((r) => r.reasons),
      notes: results.flatMap((r) => r.notes),
      checks: results.flatMap((r) => r.checks),
      metrics: Object.assign({}, ...results.map((r) => r.metrics ?? {})),
    },
    now,
  )
}

const ICON: Record<Status, string> = { pass: 'PASS', anomaly: 'ANOMALY', fail: 'FAIL' }

export function renderMarkdown(r: GateResult): string {
  const lines = [`## Data update gate: ${ICON[r.status]}`, '']
  if (r.status === 'pass') lines.push('All gates passed; safe to deploy.', '')
  if (r.status === 'anomaly') lines.push('Needs human review before merging (opened as a PR).', '')
  if (r.status === 'fail') lines.push('Broken output; nothing was committed.', '')
  if (r.reasons.length) {
    lines.push('### Reasons', '')
    for (const x of r.reasons) lines.push(`- **${x.level}** \`${x.code}\`: ${x.message}`)
    lines.push('')
  }
  if (r.checks.length) {
    lines.push('### Checks', '', '| check | status | detail |', '|---|---|---|')
    for (const c of r.checks)
      lines.push(`| ${c.name} | ${c.status} | ${(c.detail ?? '').replace(/\|/g, '\\|')} |`)
    lines.push('')
  }
  const deltas = r.metrics?.countDeltas as Record<string, Record<string, number>> | undefined
  if (deltas && Object.keys(deltas).length) {
    lines.push('### Count changes vs previous snapshot', '', '| gen | change |', '|---|---|')
    for (const [g, d] of Object.entries(deltas))
      lines.push(
        `| ${g} | ${Object.entries(d)
          .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`)
          .join(', ')} |`,
      )
    lines.push('')
  }
  if (r.notes.length) {
    lines.push('### Notes', '')
    for (const n of r.notes) lines.push(`- ${n}`)
    lines.push('')
  }
  lines.push(`_Generated ${r.generatedAt}_`, '')
  return lines.join('\n')
}

/** File access shared by the build script and the checks. */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { GEN_IDS } from '../../src/data/types'
import { currentIds, type IdTable } from './tables'

export const ROOT = path.resolve(import.meta.dirname, '../..')
export const DATA = path.join(ROOT, 'src/data/generated')
export const OUT = path.join(ROOT, 'src/share/generated')
export const tableRel = (gen: string) => `src/share/generated/ids-${gen}.json`
export { GEN_IDS }

const readJson = (f: string): unknown => JSON.parse(readFileSync(f, 'utf8'))

export function readTable(gen: string): IdTable | undefined {
  const f = path.join(OUT, `ids-${gen}.json`)
  return existsSync(f) ? (readJson(f) as IdTable) : undefined
}

export function currentFor(gen: string): IdTable {
  const dex = readJson(path.join(DATA, gen, 'dex.json')) as Parameters<typeof currentIds>[0]
  const regFile = path.join(DATA, gen, 'regulations.json')
  const regs = existsSync(regFile)
    ? (readJson(regFile) as { regulations: { id: string }[] }).regulations.map((r) => r.id)
    : []
  return currentIds(dex, regs)
}

/** One line per table, one array per line: readable diffs, append-only changes show as additions. */
export function serialize(t: IdTable): string {
  const rows = Object.entries(t).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
  return `{\n${rows.join(',\n')}\n}\n`
}

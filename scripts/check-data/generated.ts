/**
 * Offline CI check (no network, no git baseline needed): the committed generated files exist,
 * validate against the schemas, and the bridge maps are byte-identical to a fresh (offline,
 * deterministic) bridge build from the committed data + vendored NCP scripts.
 *   npm run check:generated
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { GEN_IDS } from '../../src/data/types'
import { validateGen, VersionSchema } from './schema'

const ROOT = path.resolve(import.meta.dirname, '../..')
const G = path.join(ROOT, 'src/data/generated')
const B = path.join(ROOT, 'src/bridge/generated')
const errors: string[] = []
const read = (f: string): unknown => JSON.parse(readFileSync(f, 'utf8'))

for (const gen of GEN_IDS) {
  const files = ['dex', 'learnsets', 'sets'].map((n) => path.join(G, gen, `${n}.json`))
  const missing = files.filter((f) => !existsSync(f))
  if (missing.length || !existsSync(path.join(B, `${gen}.json`))) {
    errors.push(
      `${gen}: missing generated file(s): ${missing.map((m) => path.basename(m)).join(', ')}`,
    )
    continue
  }
  const [dex, learnsets, sets] = files.map(read)
  errors.push(...validateGen(gen, { dex, learnsets, sets }).errors)
}
if (!existsSync(path.join(G, 'version.json'))) errors.push('version.json missing')
else {
  const v = VersionSchema.safeParse(read(path.join(G, 'version.json')))
  if (!v.success)
    errors.push(`version.json invalid: ${v.error.issues.map((i) => i.message).join('; ')}`)
}

// bridge up to date?
const tmp = mkdtempSync(path.join(tmpdir(), 'bridge-check-'))
try {
  execFileSync('npx', ['tsx', 'scripts/build-bridge/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, BRIDGE_OUT: tmp },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  for (const f of readdirSync(tmp)) {
    const committed = path.join(B, f)
    if (!existsSync(committed))
      errors.push(`bridge: ${f} is not committed (run npm run build:bridge)`)
    else if (!readFileSync(committed).equals(readFileSync(path.join(tmp, f))))
      errors.push(`bridge: ${f} is stale (run npm run build:bridge and commit)`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

if (errors.length) {
  console.error(`check:generated FAILED\n- ${errors.join('\n- ')}`)
  process.exit(1)
}
console.log('check:generated OK (files present, schemas valid, bridge up to date)')

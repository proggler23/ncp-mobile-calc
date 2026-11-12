/**
 * Supply-chain check (offline): every file under vendor/ncp/script_res/ matches the sha256 recorded
 * in vendor/ncp/UPSTREAM.md, and nothing extra / missing. The recorded hashes are those of the
 * UPSTREAM bytes, so when vendor/ncp-patches/*.patch exist they are reverse-applied on a temporary
 * copy first (last patch first) and the result is hashed. A hand edit of a vendored file that is
 * not captured as a patch therefore fails the check.
 *   npm run check:vendor
 */
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sha256 } from '../ncp-sync/lib'
import { gitApply, listPatches } from '../ncp-sync/patches'
import { parseUpstreamMd } from '../ncp-sync/upstream-md'

function listFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const full = path.join(dir, n)
    return statSync(full).isDirectory()
      ? listFiles(full, base)
      : [path.relative(base, full).split(path.sep).join('/')]
  })
}

/** Returns a list of problems (empty = OK). */
export function checkVendor(vendorDir: string, patchDir: string): string[] {
  const mdFile = path.join(vendorDir, 'UPSTREAM.md')
  if (!existsSync(mdFile)) return [`${mdFile} is missing`]
  const info = parseUpstreamMd(readFileSync(mdFile, 'utf8'))
  const expected = Object.entries(info.hashes)
  if (!expected.length) return ['UPSTREAM.md lists no sha256 hashes']

  const problems: string[] = []
  const tmp = mkdtempSync(path.join(tmpdir(), 'vendor-check-'))
  try {
    cpSync(vendorDir, tmp, { recursive: true })
    for (const name of listPatches(patchDir).reverse()) {
      const r = gitApply(tmp, path.join(patchDir, name), { reverse: true })
      if (!r.ok) problems.push(`patch ${name} does not reverse-apply to the vendored files`)
    }
    for (const [file, want] of expected) {
      const p = path.join(tmp, file)
      if (!existsSync(p)) problems.push(`${file}: listed in UPSTREAM.md but missing`)
      else if (sha256(readFileSync(p)) !== want)
        problems.push(`${file}: sha256 differs from UPSTREAM.md (edited without a patch?)`)
    }
    const listed = new Set(Object.keys(info.hashes))
    for (const f of listFiles(path.join(vendorDir, 'script_res'), vendorDir))
      if (!listed.has(f)) problems.push(`${f}: vendored but not listed in UPSTREAM.md`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  return problems
}

if (import.meta.main) {
  const ROOT = path.resolve(import.meta.dirname, '../..')
  const problems = checkVendor(path.join(ROOT, 'vendor/ncp'), path.join(ROOT, 'vendor/ncp-patches'))
  if (problems.length) {
    console.error(`check:vendor FAILED\n- ${problems.join('\n- ')}`)
    process.exit(1)
  }
  console.log('check:vendor OK (vendor/ncp matches the sha256 list in UPSTREAM.md)')
}

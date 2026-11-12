// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sha256 } from '../ncp-sync/lib'
import { renderUpstreamMd } from '../ncp-sync/upstream-md'
import { checkVendor } from './vendor'

let root: string
let vendor: string
let patches: string
const A = 'var a = 1\n'
const B = 'var b = 2\n'

function setup(hashes: Record<string, string>) {
  mkdirSync(path.join(vendor, 'script_res'), { recursive: true })
  mkdirSync(patches, { recursive: true })
  writeFileSync(path.join(vendor, 'script_res/a.js'), A)
  writeFileSync(path.join(vendor, 'script_res/b.js'), B)
  writeFileSync(
    path.join(vendor, 'UPSTREAM.md'),
    renderUpstreamMd({
      sha: 'a'.repeat(40),
      commitDate: '2026-01-01',
      syncedAt: 'x',
      hashes,
      patches: [],
    }),
  )
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'vendor-test-'))
  vendor = path.join(root, 'ncp')
  patches = path.join(root, 'patches')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const good = { 'script_res/a.js': sha256(A), 'script_res/b.js': sha256(B) }

describe('checkVendor', () => {
  it('passes when all hashes match', () => {
    setup(good)
    expect(checkVendor(vendor, patches)).toEqual([])
  })

  it('flags a modified file, a missing file and an unlisted file', () => {
    setup(good)
    writeFileSync(path.join(vendor, 'script_res/a.js'), 'var a = 666\n')
    writeFileSync(path.join(vendor, 'script_res/extra.js'), 'x\n')
    const p = checkVendor(vendor, patches).join('\n')
    expect(p).toContain('script_res/a.js: sha256 differs')
    expect(p).toContain('script_res/extra.js: vendored but not listed')
    rmSync(path.join(vendor, 'script_res/b.js'))
    expect(checkVendor(vendor, patches).join('\n')).toContain('script_res/b.js: listed')
  })

  it('verifies patched files against the upstream hash after reversing the patch', () => {
    setup(good)
    // Vendored a.js carries the patch; UPSTREAM.md keeps the original hash.
    writeFileSync(path.join(vendor, 'script_res/a.js'), 'var a = 2\n')
    writeFileSync(
      path.join(patches, '001-a.patch'),
      'diff --git a/script_res/a.js b/script_res/a.js\n--- a/script_res/a.js\n+++ b/script_res/a.js\n@@ -1 +1 @@\n-var a = 1\n+var a = 2\n',
    )
    expect(checkVendor(vendor, patches)).toEqual([])
    // A patched file edited further without updating the patch fails.
    writeFileSync(path.join(vendor, 'script_res/a.js'), 'var a = 3\n')
    expect(checkVendor(vendor, patches).length).toBeGreaterThan(0)
  })
})

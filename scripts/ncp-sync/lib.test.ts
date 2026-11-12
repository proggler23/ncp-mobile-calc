// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { goldenReasons } from '../check-data/gates'
import { analyzeStructure, compareGoldens, extractScriptRefs, planSync, sha256 } from './lib'
import { applyPatches, listPatches, verifyPatchesApplied } from './patches'
import { parseUpstreamMd, renderUpstreamMd } from './upstream-md'

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)
const MD = renderUpstreamMd({
  sha: SHA_A,
  commitDate: '2026-10-24',
  syncedAt: '2026-11-12T00:00:00Z',
  hashes: { 'script_res/pokedex.js': sha256('x'), 'script_res/move_data.js': sha256('y') },
  patches: [],
})

describe('UPSTREAM.md', () => {
  it('round-trips', () => {
    const info = parseUpstreamMd(MD)
    expect(info).toMatchObject({
      sha: SHA_A,
      commitDate: '2026-10-24',
      syncedAt: '2026-11-12T00:00:00Z',
      patches: [],
    })
    expect(Object.keys(info.hashes)).toEqual(['script_res/move_data.js', 'script_res/pokedex.js'])
    expect(
      parseUpstreamMd(renderUpstreamMd({ ...info, patches: ['001-fix.patch'] })).patches,
    ).toEqual(['001-fix.patch'])
  })
  it('rejects a file without a SHA', () => {
    expect(() => parseUpstreamMd('# nothing')).toThrow()
  })
})

describe('planSync (change detection, mocked remote + fs)', () => {
  it('reports unchanged when the remote SHA equals the pinned one', async () => {
    const plan = await planSync({ readUpstreamMd: () => MD, getRemoteSha: () => `${SHA_A}\n` })
    expect(plan).toEqual({ pinnedSha: SHA_A, remoteSha: SHA_A, changed: false })
  })
  it('reports changed when upstream moved', async () => {
    const plan = await planSync({ readUpstreamMd: async () => MD, getRemoteSha: async () => SHA_B })
    expect(plan.changed).toBe(true)
  })
  it('rejects garbage from the remote', async () => {
    await expect(
      planSync({ readUpstreamMd: () => MD, getRemoteSha: () => 'not a sha' }),
    ).rejects.toThrow()
  })
  it('propagates a failing remote lookup', async () => {
    await expect(
      planSync({
        readUpstreamMd: () => MD,
        getRemoteSha: () => {
          throw new Error('offline')
        },
      }),
    ).rejects.toThrow('offline')
  })
})

const page = (...srcs: string[]) =>
  srcs.map((s) => `<script type="text/javascript" src="${s}"></script>`).join('\n')

describe('analyzeStructure', () => {
  const vendored = ['script_res/pokedex.js', 'script_res/move_data.js']
  const html = page(
    'jquery-3.1.1.min.js',
    'script_res/switch_mode.js',
    'script_res/setdex_smogon.js',
    'script_res/pokedex.js',
    'script_res/move_data.js?v=2',
    'afd_res/noise.js',
  )
  const base = { vendored, pages: { 'index.html': html }, exists: () => true }

  it('extracts script refs without query strings', () => {
    expect(extractScriptRefs(html)).toContain('script_res/move_data.js')
  })
  it('reports nothing for an unchanged structure (ignored UI scripts are fine)', () => {
    expect(analyzeStructure(base).reasons).toEqual([])
  })
  it('flags a removed vendored file and guesses renames', () => {
    const r = analyzeStructure({
      ...base,
      pages: { 'index.html': html.replace('move_data.js?v=2', 'move_data_v2.js') },
      exists: (rel) => rel !== 'script_res/move_data.js',
    })
    expect(r.missing).toEqual(['script_res/move_data.js'])
    expect(r.added).toEqual(['script_res/move_data_v2.js'])
    expect(r.reasons.map((x) => x.code).sort()).toEqual(['ncp-file-added', 'ncp-file-removed'])
    expect(r.reasons.find((x) => x.code === 'ncp-file-removed')!.message).toContain(
      'renamed to script_res/move_data_v2.js',
    )
  })
  it('flags new unknown scripts as anomaly', () => {
    const r = analyzeStructure({
      ...base,
      pages: { 'index.html': html + page('script_res/damage_new.js') },
    })
    expect(r.reasons).toEqual([
      expect.objectContaining({ level: 'anomaly', code: 'ncp-file-added' }),
    ])
  })
  it('flags vendored files that no page loads any more and missing pages', () => {
    const r = analyzeStructure({
      ...base,
      pages: { 'index.html': page('script_res/pokedex.js'), 'za-calc.html': null },
    })
    expect(r.reasons.map((x) => x.code).sort()).toEqual([
      'ncp-file-unreferenced',
      'ncp-page-missing',
    ])
  })
})

describe('compareGoldens', () => {
  const s = (id: string, v: number) => ({ id, resolved: { a: 1 }, expected: { dmg: v } })
  it('computes the changed percentage', () => {
    const prev = Array.from({ length: 20 }, (_, i) => s(`s${i}`, i))
    const next = prev.map((x, i) => (i < 3 ? s(x.id, 999) : x))
    const d = compareGoldens(prev, next)
    expect(d.changed).toHaveLength(3)
    expect(d.changedFraction).toBeCloseTo(0.15)
    expect(goldenReasons(d.changedFraction)).toHaveLength(1)
  })
  it('counts removed scenarios as changed and reports additions separately', () => {
    const d = compareGoldens([s('a', 1), s('b', 1)], [s('a', 1), s('c', 1)])
    expect(d).toMatchObject({ removed: ['b'], added: ['c'], changed: [], changedFraction: 0.5 })
  })
  it('is zero for identical goldens', () => {
    expect(compareGoldens([s('a', 1)], [s('a', 1)]).changedFraction).toBe(0)
    expect(compareGoldens([], []).changedFraction).toBe(0)
  })
})

describe('patch layer', () => {
  const dirs: string[] = []
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
  })
  function setup(content: string) {
    const root = mkdtempSync(path.join(tmpdir(), 'ncp-patch-test-'))
    dirs.push(root)
    const up = path.join(root, 'upstream')
    mkdirSync(path.join(up, 'script_res'), { recursive: true })
    writeFileSync(path.join(up, 'script_res/a.js'), content)
    execFileSync('git', ['init', '-q'], { cwd: up })
    const patches = path.join(root, 'patches')
    mkdirSync(patches)
    // build a real patch: modify a copy, diff, restore
    writeFileSync(path.join(up, 'script_res/a.js'), content.replace('one', 'ONE'))
    const diff = execFileSync(
      'git',
      ['diff', '--no-index', '--no-color', 'script_res/a.js', 'script_res/a.js'],
      {
        cwd: up,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).toString()
    void diff
    return { root, up, patches }
  }
  const PATCH = `--- a/script_res/a.js
+++ b/script_res/a.js
@@ -1,2 +1,2 @@
-var one = 1
+var one = 100
 var two = 2
`
  it('applies patches in order and reports names', () => {
    const { root, patches } = setup('var one = 1\nvar two = 2\n')
    const up = path.join(root, 'fresh')
    mkdirSync(path.join(up, 'script_res'), { recursive: true })
    writeFileSync(path.join(up, 'script_res/a.js'), 'var one = 1\nvar two = 2\n')
    writeFileSync(path.join(patches, '001-one.patch'), PATCH)
    expect(listPatches(patches)).toEqual(['001-one.patch'])
    const r = applyPatches(up, patches)
    expect(r).toEqual({ applied: ['001-one.patch'] })
    expect(readFileSync(path.join(up, 'script_res/a.js'), 'utf8')).toContain('one = 100')
    // vendored tree now contains the patch -> verify passes; an unpatched tree fails verification
    expect(verifyPatchesApplied(up, patches)).toEqual([])
  })
  it('reports a patch that no longer applies (anomaly trigger) and stops', () => {
    const { root, patches } = setup('x')
    const up = path.join(root, 'moved')
    mkdirSync(path.join(up, 'script_res'), { recursive: true })
    writeFileSync(path.join(up, 'script_res/a.js'), 'var one = 5\nvar two = 2\n')
    writeFileSync(path.join(patches, '001-one.patch'), PATCH)
    writeFileSync(path.join(patches, '002-other.patch'), PATCH)
    const r = applyPatches(up, patches)
    expect(r.applied).toEqual([])
    expect(r.failed?.name).toBe('001-one.patch')
    expect(verifyPatchesApplied(up, patches)).toContain('001-one.patch')
  })
  it('has no patches by default', () => {
    expect(listPatches(path.join(tmpdir(), 'definitely-missing-dir'))).toEqual([])
  })
})

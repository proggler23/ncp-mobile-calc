#!/usr/bin/env node
// Builds the engine as a stand-alone ES bundle with Vite (code-split exactly like it will be when
// the app imports src/engine), loads it in headless Chromium and replays every golden scenario in
// the REAL browser, comparing against the recorded original-NCP results. Also prints chunk sizes.
//
// Usage: node scripts/ncp-golden/browser-verify.mjs [--keep]

import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { chromium } from '@playwright/test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncp-engine-build-'))

await build({
  root,
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: true,
    minify: true,
    lib: { entry: path.join(root, 'src/engine/index.ts'), formats: ['es'], fileName: 'engine' },
  },
})

console.log('Engine chunks (raw / gzip):')
const sizes = []
for (const f of fs.readdirSync(outDir, { recursive: true }).map(String)) {
  if (fs.statSync(path.join(outDir, f)).isDirectory()) continue
  const buf = fs.readFileSync(path.join(outDir, f))
  sizes.push([f, buf.length, zlib.gzipSync(buf).length])
}
for (const [f, raw, gz] of sizes.sort((a, b) => b[1] - a[1])) {
  console.log(
    `  ${f.padEnd(28)} ${(raw / 1024).toFixed(1).padStart(8)} kB  ${(gz / 1024).toFixed(1).padStart(7)} kB gz`,
  )
}
console.log(
  `  total ${(sizes.reduce((a, s) => a + s[1], 0) / 1024).toFixed(1)} kB, ${(sizes.reduce((a, s) => a + s[2], 0) / 1024).toFixed(1)} kB gz`,
)

const goldenDir = path.join(root, 'src/engine/__golden__')
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0])
  let file
  if (url === '/') {
    res.setHeader('content-type', 'text/html')
    res.end('<!doctype html><title>engine</title>')
    return
  } else if (url.startsWith('/golden/')) file = path.join(goldenDir, url.slice(8))
  else file = path.join(outDir, url)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404
    res.end()
    return
  }
  res.setHeader('content-type', file.endsWith('.json') ? 'application/json' : 'text/javascript')
  res.end(fs.readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(origin + '/')
const files = fs.readdirSync(goldenDir).filter((f) => f.endsWith('.json'))
let total = 0
for (const f of files) {
  const golden = JSON.parse(fs.readFileSync(path.join(goldenDir, f), 'utf8'))
  const got = await page.evaluate(
    async ([engineUrl, goldenUrl]) => {
      const engine = await import(/* @vite-ignore */ engineUrl)
      const g = await (await fetch(goldenUrl)).json()
      await engine.prepare(g.gen)
      return g.scenarios.map((sc) => {
        const r = engine.calculate(sc.input)
        const pick = (m) => ({
          damage: m.damage,
          description: m.description,
          damageText: m.damageText,
          koChanceText: m.koChance,
          hits: m.hits,
          ...(m.cooldown !== undefined ? { cooldown: m.cooldown } : {}),
        })
        return { id: sc.id, moves: r.moves.map(pick), reverseMoves: r.reverseMoves.map(pick) }
      })
    },
    [`${origin}/engine.js`, `${origin}/golden/${f}`],
  )
  golden.scenarios.forEach((sc, i) => {
    assert.deepEqual(got[i].moves, sc.expected.moves, `${sc.id} (forward)`)
    assert.deepEqual(got[i].reverseMoves, sc.expected.reverseMoves, `${sc.id} (reverse)`)
  })
  total += golden.scenarios.length
  console.log(`browser: gen ${golden.gen}: ${golden.scenarios.length} scenarios match`)
}
await browser.close()
server.close()
if (!process.argv.includes('--keep')) fs.rmSync(outDir, { recursive: true, force: true })
if (errors.length) throw new Error('page errors: ' + errors.join(' | '))
console.log(`browser verification OK: ${total} scenarios`)

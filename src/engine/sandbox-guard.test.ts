import { describe, expect, it } from 'vitest'

// The sandbox evaluates vendored upstream scripts (`evalScript`). Keep a single, auditable caller.
const ALLOWED_CALLER = 'engine/runtime.ts'
const SANDBOX_DIR = 'engine/sandbox/'

// Every non-test source file of the app, as text (paths relative to src/, forward slashes).
const raw = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})
const files = Object.entries(raw).map(([p, text]) => ({ rel: p.replace(/^\/src\//, ''), text }))
const outsideSandbox = files.filter((f) => !f.rel.startsWith(SANDBOX_DIR))

describe('sandbox containment', () => {
  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(20)
    expect(files.some((f) => f.rel === ALLOWED_CALLER)).toBe(true)
  })

  it('calls evalScript only from src/engine/runtime.ts (and inside the sandbox itself)', () => {
    const callers = outsideSandbox.filter((f) => /\bevalScript\b/.test(f.text)).map((f) => f.rel)
    expect(callers).toEqual([ALLOWED_CALLER])
  })

  it('creates the sandbox (createSandbox) only from src/engine/runtime.ts', () => {
    const callers = outsideSandbox.filter((f) => /\bcreateSandbox\b/.test(f.text)).map((f) => f.rel)
    expect(callers).toEqual([ALLOWED_CALLER])
  })

  it('imports sandbox values only from the engine; other modules never reach into it', () => {
    const importers = outsideSandbox
      .filter((f) => /from\s+['"][^'"]*\/sandbox\/[^'"]*['"]/.test(f.text))
      .map((f) => f.rel)
      .filter((rel) => !rel.startsWith('engine/'))
    expect(importers).toEqual([])
  })

  it('has no eval / new Function outside the sandbox', () => {
    const bad = outsideSandbox
      .filter((f) => /(?<![\w.])eval\s*\(|new\s+Function\s*\(/.test(f.text))
      .map((f) => f.rel)
    expect(bad).toEqual([])
  })
})

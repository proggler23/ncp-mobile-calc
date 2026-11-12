import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { expectedFiles, syncReadme } from './docs-legal'

describe('legal docs', () => {
  it.each(expectedFiles().map((f) => [f.path, f.content] as const))(
    '%s is up to date (run `npm run docs:legal`)',
    (path, content) => {
      const current = readFileSync(path, 'utf8')
      expect(current).toBe(content)
    },
  )

  it('replaces only the marked region', () => {
    const out = syncReadme('a\n<!-- legal:start -->\nold\n<!-- legal:end -->\nb', 'NEW')
    expect(out).toBe('a\n<!-- legal:start -->\n\nNEW\n\n<!-- legal:end -->\nb')
    expect(() => syncReadme('no markers', 'x')).toThrow()
  })
})

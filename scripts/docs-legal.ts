/**
 * Regenerates the legal parts of the docs from `src/legal/content.ts`:
 *   - README.md: the region between `<!-- legal:start -->` and `<!-- legal:end -->`
 *     (privacy policy and imprint),
 *   - docs/PRIVACY.md: the whole file.
 * `npm run docs:legal` writes; `npm run docs:legal -- --check` only verifies (exit 1 if stale).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { privacyDocMarkdown, readmeLegalMarkdown } from '../src/legal/content'

export const START = '<!-- legal:start -->'
export const END = '<!-- legal:end -->'

/** Replaces the marked region of a README text. Throws if the markers are missing. */
export function syncReadme(readme: string, region: string = readmeLegalMarkdown()): string {
  const a = readme.indexOf(START)
  const b = readme.indexOf(END)
  if (a < 0 || b < a) throw new Error(`README.md needs ${START} ... ${END}`)
  return `${readme.slice(0, a + START.length)}\n\n${region.trim()}\n\n${readme.slice(b)}`
}

/** Paths are relative to the repository root (npm scripts and vitest run from there). */
const root = (p: string) => resolve(process.cwd(), p)

export function expectedFiles(): { path: string; content: string }[] {
  const readme = readFileSync(root('README.md'), 'utf8')
  return [
    { path: 'README.md', content: syncReadme(readme) },
    { path: 'docs/PRIVACY.md', content: privacyDocMarkdown().trim() + '\n' },
  ]
}

function main(): void {
  const check = process.argv.includes('--check')
  let stale = false
  for (const f of expectedFiles()) {
    let current = ''
    try {
      current = readFileSync(root(f.path), 'utf8')
    } catch {
      /* new file */
    }
    if (current === f.content) continue
    stale = true
    if (!check) writeFileSync(root(f.path), f.content)
    console.log(`${check ? 'out of date' : 'updated'}: ${f.path}`)
  }
  if (check && stale) {
    console.error('Run `npm run docs:legal` and commit the result.')
    process.exit(1)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()

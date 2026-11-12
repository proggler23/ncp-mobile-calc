import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const CACHE_DIR = path.resolve(import.meta.dirname, '../../.cache/build-data')
const USER_AGENT = 'ncp-mobile-calc-build-data (github.com/clfbox/ncp-mobile-calc)'
const REFRESH = process.argv.includes('--refresh')

const MISSING = '\u0000404'
let lastRequest = 0
async function politeDelay() {
  const wait = 250 - (Date.now() - lastRequest)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequest = Date.now()
}

/**
 * Download a URL into the cache (own dir, never executed). Returns text, or null on 404.
 * `ttlMs` = how long a cached file stays fresh (Infinity for immutable data).
 */
export async function cachedText(
  url: string,
  cacheName: string,
  ttlMs = Infinity,
): Promise<string | null> {
  const file = path.join(CACHE_DIR, 'downloads', cacheName)
  try {
    const st = await stat(file)
    if (!REFRESH) {
      const text = await readFile(file, 'utf8')
      if (text.startsWith(MISSING)) {
        if (Date.now() - st.mtimeMs < 24 * 3600_000) return null
      } else if (Date.now() - st.mtimeMs < ttlMs) return text
    }
  } catch {
    /* not cached */
  }
  await politeDelay()
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
  if (res.status === 404) {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, MISSING)
    return null
  }
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  const text = await res.text()
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, text)
  return text
}

export async function cachedJson<T>(url: string, cacheName: string, ttlMs = Infinity) {
  const text = await cachedText(url, cacheName, ttlMs)
  if (text === null) return null
  return JSON.parse(text) as T
}

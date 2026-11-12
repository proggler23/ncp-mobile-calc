/**
 * `VITE_GOATCOUNTER_URL` (anonymous usage statistics): empty / unset disables analytics. Otherwise
 * an https URL of a GoatCounter `/count` endpoint, normalized to `origin + "/count"`:
 *  - `https://<code>.goatcounter.com` (optionally with `/` or `/count`) is accepted as it is;
 *  - any other host (self-hosted GoatCounter) needs the explicit `/count` path.
 * No credentials, query or fragment. Anything else is a build error rather than a runtime string.
 */
export function normalizeGoatCounterUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim()
  if (!value) return ''
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`VITE_GOATCOUNTER_URL is not a valid URL: ${JSON.stringify(value)}`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`VITE_GOATCOUNTER_URL must be https, got ${url.protocol}`)
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_GOATCOUNTER_URL must not contain credentials, a query or a fragment')
  }
  const path = url.pathname.replace(/\/+$/, '')
  const hosted = /^[a-z0-9][a-z0-9-]*\.goatcounter\.com$/.test(url.hostname)
  if (path === '/count' || (hosted && path === '')) return `${url.origin}/count`
  throw new Error(
    `VITE_GOATCOUNTER_URL must be https://<code>.goatcounter.com or end in /count, got ${JSON.stringify(value)}`,
  )
}

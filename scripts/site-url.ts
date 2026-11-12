/**
 * `VITE_SITE_URL` (absolute Open Graph URLs): an http(s) URL, normalized to `origin + path + "/"`
 * (no query, fragment or credentials). Anything else is a build error rather than markup.
 */
export function normalizeSiteUrl(raw: string | undefined, fallback: string): string {
  const value = (raw ?? '').trim() || fallback
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`VITE_SITE_URL is not a valid URL: ${JSON.stringify(value)}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`VITE_SITE_URL must be http(s), got ${url.protocol}`)
  }
  const path = url.pathname.replace(/\/*$/, '/')
  return `${url.origin}${path}`
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export const escapeAttr = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)

/** Replace every `__SITE_URL__` literally (a replacer function: `$&`, `$1`... are not patterns). */
export function injectSiteUrl(html: string, siteUrl: string): string {
  const safe = escapeAttr(siteUrl)
  return html.replaceAll('__SITE_URL__', () => safe)
}

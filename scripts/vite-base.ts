/** `VITE_BASE` always as `/path/` (leading and trailing slash); empty means the root. */
export function normalizeBase(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed || trimmed === '/') return '/'
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith('//')) {
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`
}

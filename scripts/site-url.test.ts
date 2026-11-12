import { describe, expect, it } from 'vitest'
import { injectSiteUrl, normalizeSiteUrl } from './site-url'

const DEF = 'https://example.github.io/app/'

describe('normalizeSiteUrl', () => {
  it('uses the fallback when unset and normalizes the trailing slash', () => {
    expect(normalizeSiteUrl(undefined, DEF)).toBe(DEF)
    expect(normalizeSiteUrl('', DEF)).toBe(DEF)
    expect(normalizeSiteUrl('https://a.dev/x', DEF)).toBe('https://a.dev/x/')
    expect(normalizeSiteUrl('https://a.dev', DEF)).toBe('https://a.dev/')
    expect(normalizeSiteUrl('http://a.dev/x//?q=1#h', DEF)).toBe('http://a.dev/x/')
  })
  it('rejects non-http(s) and malformed values', () => {
    expect(() => normalizeSiteUrl('javascript:alert(1)', DEF)).toThrow()
    expect(() => normalizeSiteUrl('ftp://a.dev/', DEF)).toThrow()
    expect(() => normalizeSiteUrl('not a url', DEF)).toThrow()
  })
})

describe('injectSiteUrl', () => {
  it('replaces literally, without $-patterns and with attribute escaping', () => {
    const out = injectSiteUrl(
      '<meta content="__SITE_URL__x"><a href="__SITE_URL__">',
      'https://a.dev/$&"><b>/',
    )
    expect(out).toBe(
      '<meta content="https://a.dev/$&amp;&quot;&gt;&lt;b&gt;/x"><a href="https://a.dev/$&amp;&quot;&gt;&lt;b&gt;/">',
    )
  })
})

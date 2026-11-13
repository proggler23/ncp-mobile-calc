import { describe, expect, it } from 'vitest'
import { generateSitemap, injectSiteUrl, normalizeSiteUrl } from './site-url'

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

describe('generateSitemap', () => {
  const loc = (xml: string) => /<loc>(.*)<\/loc>/.exec(xml)?.[1]
  it('emits a urlset with a single loc and no lastmod', () => {
    const xml = generateSitemap(DEF)
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml.match(/<url>/g)).toHaveLength(1)
    expect(xml).not.toContain('lastmod')
    expect(loc(xml)).toBe(DEF)
  })
  it('uses the default and custom normalized URLs', () => {
    const def = 'https://proggler23.github.io/ncp-mobile-calc/'
    expect(loc(generateSitemap(normalizeSiteUrl(undefined, def)))).toBe(def)
    expect(loc(generateSitemap(normalizeSiteUrl('https://example.org/foo', def)))).toBe(
      'https://example.org/foo/',
    )
  })
  it('escapes XML special characters', () => {
    expect(loc(generateSitemap('https://a.dev/?a=1&b=<2>/'))).toBe(
      'https://a.dev/?a=1&amp;b=&lt;2&gt;/',
    )
  })
})

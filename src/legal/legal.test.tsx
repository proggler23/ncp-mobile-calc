import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ANALYTICS_EVENTS, GEN_EVENT_PATTERN, STATIC_EVENTS } from '../analytics'
import { CONTACT_EMAIL, OWNER_CITY, OWNER_NAME } from '../config'
import { MenuSheet } from '../features/menu/MenuSheet'
import { store } from '../state/app'
import { LEGAL, LEGAL_UPDATED, docToMarkdown } from './content'
import LegalPage from './LegalPage'
import { legalPageForRoute } from './route'

afterEach(cleanup)

const show = (lang: 'en' | 'de') => act(() => store.set({ lang }))

describe('legal pages', () => {
  it.each([
    ['en', 'Imprint / Disclosure'],
    ['de', 'Impressum'],
  ] as const)('imprint shows owner, city, email, purpose and disclaimer (%s)', (lang, title) => {
    show(lang)
    render(<LegalPage page="imprint" />)
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    const page = screen.getByRole('article')
    expect(within(page).getByText(new RegExp(OWNER_NAME))).toBeInTheDocument()
    expect(page.textContent).toContain(OWNER_CITY)
    expect(within(page).getByRole('link', { name: CONTACT_EMAIL })).toHaveAttribute(
      'href',
      `mailto:${CONTACT_EMAIL}`,
    )
    expect(page.textContent).toMatch(/Nimbasa City Post/)
    expect(page.querySelector('#haftung')).not.toBeNull()
    expect(page.textContent).toMatch(lang === 'de' ? /ohne Gewähr/ : /without warranty/)
  })

  it('imprint states the media owner in German', () => {
    show('de')
    render(<LegalPage page="imprint" />)
    expect(screen.getByText('Medieninhaber und Herausgeber')).toBeInTheDocument()
    expect(screen.getByText(/§ 25 MedienG/)).toBeInTheDocument()
  })

  it.each([
    [
      'en',
      'Privacy policy',
      ['Controller', 'Hosting (GitHub Pages)', 'Your rights'],
      /Art\. 6\(1\)\(f\) GDPR/,
    ],
    [
      'de',
      'Datenschutzerklärung',
      ['Verantwortlicher', 'Hosting (GitHub Pages)', 'Ihre Rechte'],
      /Art\. 6 Abs\. 1 lit\. f DSGVO/,
    ],
  ] as const)('privacy page has all sections (%s)', (lang, title, headings, basis) => {
    show(lang)
    render(<LegalPage page="privacy" />)
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    for (const h of headings) expect(screen.getByRole('heading', { name: h })).toBeInTheDocument()
    expect(LEGAL[lang].privacy.sections.map((s) => s.id)).toEqual([
      'verantwortlicher',
      'hosting',
      'statistik',
      'lokal',
      'links',
      'extern',
      'rechte',
    ])
    const page = screen.getByRole('article')
    expect(page.textContent).toMatch(basis)
    expect(page.textContent).toContain(LEGAL_UPDATED.slice(0, 4))
    expect(page.textContent).toContain(OWNER_NAME)
    expect(page.textContent).toContain(OWNER_CITY)
    expect(page.textContent).toContain(CONTACT_EMAIL)
    const dsb = within(page).getByRole('link', { name: 'www.dsb.gv.at' })
    expect(dsb).toHaveAttribute('href', 'https://www.dsb.gv.at')
    expect(dsb).toHaveAttribute('rel', 'noopener noreferrer')
    expect(
      within(page)
        .getAllByRole('link')
        .some((a) => a.getAttribute('href')?.includes('github-general-privacy-statement')),
    ).toBe(true)
  })

  it.each(['en', 'de'] as const)(
    'privacy text lists exactly the analytics events from src/analytics (%s)',
    (lang) => {
      show(lang)
      render(<LegalPage page="privacy" />)
      const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
      for (const name of ANALYTICS_EVENTS) {
        expect(items.filter((i) => i.includes(name)).length, name).toBeGreaterThanOrEqual(1)
      }
      expect(ANALYTICS_EVENTS).toContain(GEN_EVENT_PATTERN)
      expect(ANALYTICS_EVENTS).toHaveLength(STATIC_EVENTS.length + 1)
      // No event is documented that the code cannot send: every listed `code` name is known.
      const listed = items.flatMap((i) =>
        [...i.matchAll(/`?([a-z-]+\/[a-z<>/-]+|share-open(?:-new)?)`?:/g)].map((m) => m[1]),
      )
      for (const n of listed) expect(ANALYTICS_EVENTS, String(n)).toContain(n)
    },
  )

  it('markdown keeps the section structure', () => {
    const md = docToMarkdown(LEGAL.en.privacy, 2)
    expect(md).toMatch(/^## Privacy policy/)
    expect(md).toContain('### Controller')
  })

  it('routes map to pages', () => {
    expect(legalPageForRoute('impressum')).toBe('imprint')
    expect(legalPageForRoute('datenschutz')).toBe('privacy')
    expect(legalPageForRoute('haftungsausschluss')).toBe('disclaimer')
    expect(legalPageForRoute('teams')).toBeUndefined()
    expect(legalPageForRoute('')).toBeUndefined()
  })
})

describe('menu legal links', () => {
  it.each([
    ['en', 'Imprint / Disclosure', '/impressum'],
    ['en', 'Privacy policy', '/datenschutz'],
    ['en', 'Disclaimer', '/haftungsausschluss'],
    ['de', 'Impressum', '/impressum'],
    ['de', 'Datenschutz', '/datenschutz'],
    ['de', 'Haftungsausschluss', '/haftungsausschluss'],
  ] as const)('(%s) "%s" closes the menu and navigates', async (lang, name, path) => {
    show(lang)
    let closed = false
    render(<MenuSheet onClose={() => (closed = true)} />)
    const group = screen.getByRole('heading', { name: lang === 'en' ? 'Legal' : 'Rechtliches' })
    const link = within(group.parentElement as HTMLElement).getByRole('link', { name })
    expect(link).toHaveAttribute('href', `#${path}`)
    fireEvent.click(link)
    expect(closed).toBe(true)
    await waitFor(() => expect(location.hash).toBe(`#${path}`))
  })
})

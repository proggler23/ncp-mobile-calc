import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallHowTo } from '../features/install/InstallHowTo'
import { ShareSheet } from '../features/matchup/ShareSheet'
import { MenuSheet } from '../features/menu/MenuSheet'
import { PRIVACY_URL } from '../config'
import { initApp, pickSpecies, setGen, store, updateSet } from '../state/app'
import { promptInstall, registerInstallListeners, resetInstall } from '../state/install'
import { getRepository } from '../storage'
import { resetAll } from '../test-utils'
import { ToastHost, hideToast } from '../ui/Toast'
import {
  analyticsStore,
  buildUrl,
  cleanReferrer,
  pagePath,
  resetAnalytics,
  screenBucket,
  setStatsOptOut,
  startAnalytics,
  track,
  trackAppOpen,
} from '.'

const ENDPOINT = 'https://test.goatcounter.com/count'
const fetchMock = vi.fn()

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 40))))
/** Parsed query of every request made so far. */
type Hit = { url: string; origin: string } & Partial<Record<'p' | 't' | 'r' | 'e' | 's', string>>
const sent = (): Hit[] =>
  fetchMock.mock.calls.map((c) => {
    const url = new URL(String(c[0]))
    return {
      url: String(c[0]),
      origin: url.origin + url.pathname,
      ...Object.fromEntries(url.searchParams),
    }
  })
const names = () => sent().map((h) => `${h.e ? 'event' : 'view'}:${h.p}`)

const define = (target: object, name: string, value: unknown) =>
  Object.defineProperty(target, name, { value, configurable: true })
const undefine = (target: object, name: string) => Reflect.deleteProperty(target, name)

beforeEach(async () => {
  vi.stubEnv('VITE_GOATCOUNTER_URL', ENDPOINT)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  await resetAll({ gen: 'champions' })
  resetAnalytics()
  history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
  hideToast()
  vi.unstubAllGlobals()
  vi.stubEnv('VITE_GOATCOUNTER_URL', '')
  for (const n of ['doNotTrack', 'globalPrivacyControl', 'onLine', 'webdriver', 'standalone'])
    undefine(navigator, n)
  undefine(window, '__NCP_ANALYTICS_FORCE__')
  undefine(document, 'referrer')
  undefine(navigator, 'share')
  undefine(navigator, 'clipboard')
})

describe('request building', () => {
  it('builds the documented /count GET query (events: e=true, no referrer / screen)', () => {
    expect(
      buildUrl(ENDPOINT, { path: 'share/copy-link', title: 'share/copy-link', event: true }),
    ).toBe(`${ENDPOINT}?p=share%2Fcopy-link&t=share%2Fcopy-link&e=true`)
    expect(
      buildUrl(ENDPOINT, {
        path: '/',
        title: 'NCP Mobile Calc',
        event: false,
        referrer: 'https://a.dev/x',
        screen: '360,768,1',
      }),
    ).toBe(`${ENDPOINT}?p=%2F&t=NCP+Mobile+Calc&r=https%3A%2F%2Fa.dev%2Fx&s=360%2C768%2C1`)
  })

  it('strips query and hash from the referrer and drops same-site / odd ones', () => {
    expect(cleanReferrer('https://a.dev/p/q?x=1#h', 'https://me.dev')).toBe('https://a.dev/p/q')
    expect(cleanReferrer('https://me.dev/x', 'https://me.dev')).toBe('')
    expect(cleanReferrer('android-app://com.x', 'https://me.dev')).toBe('')
    expect(cleanReferrer('', 'https://me.dev')).toBe('')
    expect(cleanReferrer('nonsense', 'https://me.dev')).toBe('')
  })

  it('reduces the path to the app-relative pathname and the screen to coarse buckets', () => {
    expect(pagePath('/ncp-mobile-calc/', '/ncp-mobile-calc/')).toBe('/')
    expect(pagePath('/', '/')).toBe('/')
    expect(screenBucket(393, 851)).toBe('414,1024,1')
    expect(screenBucket(5000, 10)).toBe('2560,360,1')
  })

  it('app-open is a page view of "/" without hash, query or own referrer', async () => {
    history.replaceState(null, '', '/?secret=1#c2SECRETDATA')
    define(document, 'referrer', 'https://reddit.com/r/VGC/comments/abc?utm=1#frag')
    trackAppOpen()
    await flush()
    expect(sent()).toHaveLength(1)
    const hit = sent()[0]!
    expect(hit.origin).toBe(ENDPOINT)
    expect(hit.p).toBe('/')
    expect(hit.e).toBeUndefined()
    expect(hit.r).toBe('https://reddit.com/r/VGC/comments/abc')
    expect(hit.s).toMatch(/^\d+,\d+,1$/)
    expect(hit.url).not.toMatch(/#|SECRET|secret/)
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      method: 'GET',
      mode: 'no-cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
  })
})

describe('never sends when', () => {
  const attempt = async () => {
    track('share-open')
    trackAppOpen()
    await flush()
  }

  it('no endpoint is configured', async () => {
    vi.stubEnv('VITE_GOATCOUNTER_URL', '')
    startAnalytics()
    await attempt()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('the user opted out', async () => {
    setStatsOptOut(true)
    await attempt()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('Do Not Track is on', async () => {
    define(navigator, 'doNotTrack', '1')
    await attempt()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('Global Privacy Control is on', async () => {
    define(navigator, 'globalPrivacyControl', true)
    await attempt()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('the device is offline (and nothing is queued for later)', async () => {
    define(navigator, 'onLine', false)
    await attempt()
    define(navigator, 'onLine', true)
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('the browser is automated, unless the test flag is set (which only lifts that block)', async () => {
    define(navigator, 'webdriver', true)
    await attempt()
    expect(fetchMock).not.toHaveBeenCalled()
    define(window, '__NCP_ANALYTICS_FORCE__', true)
    await attempt()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // ...but never overrides DNT, GPC or the opt-out
    fetchMock.mockClear()
    define(navigator, 'doNotTrack', '1')
    await attempt()
    undefine(navigator, 'doNotTrack')
    define(navigator, 'globalPrivacyControl', true)
    await attempt()
    undefine(navigator, 'globalPrivacyControl')
    setStatsOptOut(true)
    await attempt()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('sends again after opting back in', async () => {
    setStatsOptOut(true)
    await attempt()
    setStatsOptOut(false)
    await attempt()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('start-up events', () => {
  it('sends app-open and gen/<gen>/<reg> once; generation changes dedupe within the session', async () => {
    await initApp()
    startAnalytics()
    startAnalytics() // idempotent
    await flush()
    const reg = store.get().regulation
    expect(names()).toEqual(['view:/', `event:gen/champions/${reg}`])

    await setGen('sv')
    await flush()
    expect(names()).toHaveLength(3)
    expect(names()[2]).toBe(`event:gen/sv/${store.get().regulation}`)

    await setGen('champions') // seen before in this session
    await flush()
    expect(names()).toHaveLength(3)
    expect(sent().every((h) => !h.url.includes('#'))).toBe(true)
  })

  it('sends install/standalone once per device', async () => {
    define(navigator, 'standalone', true)
    await initApp()
    startAnalytics()
    await flush()
    expect(names().filter((n) => n.endsWith('install/standalone'))).toHaveLength(1)
    expect((await (await getRepository()).getSettings()).analytics?.standaloneSent).toBe(true)

    // "next start": fresh module state, same stored settings
    fetchMock.mockClear()
    resetAnalytics()
    startAnalytics()
    await flush()
    expect(names().some((n) => n.endsWith('install/standalone'))).toBe(false)
  })

  it('does not send install/standalone in a normal browser tab or when opted out', async () => {
    await initApp()
    startAnalytics()
    await flush()
    expect(names().some((n) => n.endsWith('install/standalone'))).toBe(false)

    resetAnalytics()
    define(navigator, 'standalone', true)
    setStatsOptOut(true)
    fetchMock.mockClear()
    startAnalytics()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('share and install events', () => {
  const stub = (name: string, value: unknown) => define(navigator, name, value)
  const open = async () => {
    await initApp()
    await pickSpecies('mine', 'incineroar')
    await pickSpecies('opp', 'garchomp')
    updateSet('mine', (s) => ({ ...s, moveIds: ['flareblitz'] }))
    const row = store.get().calc!.result.moves[0]!
    render(
      <>
        <ShareSheet
          row={row}
          move={{ direction: 'forward', index: 0 }}
          moveName="Flare Blitz"
          defenderName="Garchomp"
          onClose={() => {}}
        />
        <ToastHost />
      </>,
    )
  }
  const press = async (name: RegExp) => {
    const btn = screen.getByRole('button', { name })
    await waitFor(() => expect(btn).toBeEnabled())
    fireEvent.click(btn)
    await flush()
  }

  it('native share: share/native after navigator.share resolves', async () => {
    stub('share', vi.fn().mockResolvedValue(undefined))
    await open()
    await press(/Share calc/)
    expect(names()).toEqual(['event:share/native'])
  })

  it('no event when the share sheet is dismissed (AbortError)', async () => {
    stub('share', vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')))
    await open()
    await press(/Share calc/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('copy text / copy link: after the clipboard write succeeded', async () => {
    stub('clipboard', { writeText: vi.fn().mockResolvedValue(undefined) })
    await open()
    await press(/Copy text/)
    expect(names()).toEqual(['event:share/copy-text'])
    cleanup()
    fetchMock.mockClear()
    await open()
    await press(/Copy link/)
    expect(names()).toEqual(['event:share/copy-link'])
  })

  it('no event when copying fails', async () => {
    stub('clipboard', { writeText: vi.fn().mockRejectedValue(new Error('denied')) })
    await open()
    await press(/Copy link/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('install/accepted only when the install dialog was accepted', async () => {
    for (const outcome of ['dismissed', 'accepted'] as const) {
      resetInstall()
      const target = new EventTarget()
      registerInstallListeners(target)
      const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
        prompt: () => Promise<void>
        userChoice: Promise<{ outcome: string }>
      }
      e.prompt = async () => {}
      e.userChoice = Promise.resolve({ outcome })
      target.dispatchEvent(e)
      await promptInstall()
      await flush()
    }
    expect(names()).toEqual(['event:install/accepted'])
  })

  it('install/ios-howto when the iOS instructions open', async () => {
    render(<InstallHowTo onClose={() => {}} />)
    await flush()
    expect(names()).toEqual(['event:install/ios-howto'])
  })

  it('never puts species, moves or a hash into any request', async () => {
    stub('share', vi.fn().mockResolvedValue(undefined))
    await open()
    startAnalytics()
    await press(/Share calc/)
    await flush()
    expect(sent().length).toBeGreaterThan(1)
    for (const h of sent()) expect(h.url).not.toMatch(/#|incineroar|garchomp|flare/i)
  })
})

describe('opt-out setting', () => {
  it('is persisted on the device and not part of a backup (export or import)', async () => {
    const repo = await getRepository()
    setStatsOptOut(true)
    await waitFor(async () => expect((await repo.getSettings()).analytics?.optOut).toBe(true))
    expect(JSON.parse(await repo.exportBackup()).settings).not.toHaveProperty('analytics')

    // an imported file cannot flip it
    const file = JSON.stringify({
      app: 'ncp-mobile-calc',
      version: 1,
      teams: [],
      customSets: [],
      settings: { lang: 'en', gen: 'champions', format: 'doubles', analytics: { optOut: false } },
    })
    await repo.importBackup(file, 'replace')
    expect((await repo.getSettings()).analytics?.optOut).toBe(true)

    resetAnalytics()
    track('share-open') // loads the stored choice first
    await flush()
    expect(analyticsStore.get().optOut).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a corrupt stored value falls back to the default (on)', async () => {
    const repo = await getRepository()
    await repo.setSettings({ analytics: { optOut: 'yes' } as never })
    expect((await repo.getSettings()).analytics).toBeUndefined()
  })
})

describe('menu privacy section', () => {
  it.each([
    [
      'en',
      'Privacy',
      'Anonymous usage statistics via GoatCounter: no cookies, no personal data, no calc content.',
      'Send anonymous statistics',
    ],
    [
      'de',
      'Datenschutz',
      'Anonyme Nutzungsstatistik über GoatCounter: keine Cookies, keine personenbezogenen Daten, keine Calc-Inhalte.',
      'Anonyme Statistik senden',
    ],
  ] as const)(
    'shows text, details link and a default-on switch (%s)',
    async (lang, title, text, label) => {
      act(() => store.set({ lang }))
      render(<MenuSheet onClose={() => {}} />)
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
      expect(screen.getByText(text, { exact: false })).toBeInTheDocument()
      const link = screen.getByRole('link', { name: 'Details' })
      expect(link).toHaveAttribute('href', PRIVACY_URL)
      expect(PRIVACY_URL).toBe('https://github.com/proggler23/ncp-mobile-calc#privacy')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      const sw = screen.getByRole('switch', { name: label })
      expect(sw).toBeChecked()
      fireEvent.click(sw)
      expect(sw).not.toBeChecked()
      expect(analyticsStore.get().optOut).toBe(true)
      await waitFor(async () =>
        expect((await (await getRepository()).getSettings()).analytics?.optOut).toBe(true),
      )
      fireEvent.click(sw)
      expect(analyticsStore.get().optOut).toBe(false)
    },
  )

  it('hides the switch and says so when the build has no endpoint', () => {
    vi.stubEnv('VITE_GOATCOUNTER_URL', '')
    act(() => store.set({ lang: 'en' }))
    render(<MenuSheet onClose={() => {}} />)
    expect(screen.queryByRole('switch', { name: 'Send anonymous statistics' })).toBeNull()
    expect(screen.getByText('Statistics are disabled in this build.')).toBeInTheDocument()
  })
})

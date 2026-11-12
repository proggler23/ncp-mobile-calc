/**
 * Anonymous, cookieless usage statistics via GoatCounter (opt-out). What is sent is listed in the
 * privacy policy (src/legal/content.ts, README "Privacy"); the request format follows
 * GoatCounter's documented `/count` endpoint (https://www.goatcounter.com/help/pixel): a plain
 * GET with `p` (path or event name), `t` (title), `r` (referrer), `e` (event flag) and `s`
 * (screen size). GoatCounter's own count.js is deliberately not loaded.
 *
 * Nothing is sent when: no endpoint was configured at build time (`VITE_GOATCOUNTER_URL`), the
 * user opted out, the browser signals Do Not Track / Global Privacy Control, the device is
 * offline (the hit is dropped, never queued), or the page is automated (`navigator.webdriver`).
 * The window flag `__NCP_ANALYTICS_FORCE__` bypasses ONLY the automation check (for e2e tests);
 * it never overrides the opt-out, DNT or GPC.
 */
import { isStandalone, readEnv } from '../install/platform'
import { getRepository, initApp, isFreshDevice, store } from '../state/app'
import { createStore, useStore } from '../state/store'
import type { AnalyticsPrefs } from '../storage/types'
import type { AnalyticsEvent } from './events'

export { ANALYTICS_EVENTS, GEN_EVENT_PATTERN, STATIC_EVENTS } from './events'
export type { AnalyticsEvent } from './events'

interface Hit {
  /** Page path or, for events, the event name (never starts with a slash). */
  path: string
  title: string
  event: boolean
  referrer?: string
  screen?: string
}

/** The validated endpoint from the build (empty = analytics disabled). Read lazily for tests. */
export function endpoint(): string {
  const v: unknown = import.meta.env.VITE_GOATCOUNTER_URL
  return typeof v === 'string' ? v : ''
}

export const analyticsEnabled = (): boolean => endpoint() !== ''

// ---------------------------------------------------------------------------------------------
// Request building (pure)
// ---------------------------------------------------------------------------------------------

const BUCKETS = [360, 414, 480, 768, 1024, 1280, 1920, 2560]
const bucket = (n: number): number => BUCKETS.find((b) => n <= b) ?? 2560

/** Coarse screen size (`width,height,scale` as documented): both sides rounded up to a bucket. */
export function screenBucket(width: number, height: number): string {
  return `${bucket(width)},${bucket(height)},1`
}

/** Referrer reduced to origin + path (no query, no fragment); empty for same-site or unparsable. */
export function cleanReferrer(referrer: string, ownOrigin: string): string {
  try {
    const u = new URL(referrer)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    if (u.origin === ownOrigin) return ''
    return u.origin + u.pathname
  } catch {
    return ''
  }
}

/** The page path relative to the app base, e.g. `/`. Never the hash or the query. */
export function pagePath(pathname: string, base: string): string {
  const rel = pathname.startsWith(base) ? pathname.slice(base.length) : pathname
  return '/' + rel.replace(/^\/+/, '')
}

export function buildUrl(base: string, hit: Hit): string {
  const q = new URLSearchParams()
  q.set('p', hit.path)
  q.set('t', hit.title)
  if (hit.referrer) q.set('r', hit.referrer)
  if (hit.event) q.set('e', 'true')
  if (hit.screen) q.set('s', hit.screen)
  return `${base}?${q.toString()}`
}

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

export interface AnalyticsState {
  optOut: boolean
}

export const analyticsStore = createStore<AnalyticsState>({ optOut: false })

export function useAnalytics<T>(selector: (s: AnalyticsState) => T): T {
  return useStore(analyticsStore, selector)
}

let prefs: AnalyticsPrefs = {}
let ready: Promise<void> | undefined
let freshUsed = false
const sentGen = new Set<string>()

/** Test helper: forget everything in memory (storage is untouched). */
export function resetAnalytics(): void {
  prefs = {}
  ready = undefined
  freshUsed = false
  started = false
  unsubscribe?.()
  unsubscribe = undefined
  lastGen = undefined
  sentGen.clear()
  analyticsStore.replace({ optOut: false })
}

/** Whether the browser, device and user allow a hit right now (the endpoint is checked apart). */
export function mayTransmit(): boolean {
  if (analyticsStore.get().optOut) return false
  const nav = navigator as Navigator & {
    doNotTrack?: string | null
    msDoNotTrack?: string | null
    globalPrivacyControl?: boolean
  }
  const w = window as Window & { doNotTrack?: string | null; __NCP_ANALYTICS_FORCE__?: boolean }
  const dnt = [nav.doNotTrack, nav.msDoNotTrack, w.doNotTrack]
  if (dnt.some((v) => v === '1' || v === 'yes')) return false
  if (nav.globalPrivacyControl === true) return false
  if (nav.onLine === false) return false
  if (nav.webdriver && w.__NCP_ANALYTICS_FORCE__ !== true) return false
  return true
}

function transmit(hit: Hit): void {
  const url = endpoint()
  if (!url || !mayTransmit() || typeof fetch !== 'function') return
  try {
    // A documented plain GET; the response (a 1x1 GIF) is not needed, so no-cors is enough.
    void fetch(buildUrl(url, hit), {
      method: 'GET',
      mode: 'no-cors',
      credentials: 'omit',
      cache: 'no-store',
      keepalive: true,
      referrerPolicy: 'no-referrer',
    }).catch(() => {})
  } catch {
    /* never let statistics break the app */
  }
}

/** Reads the stored preferences once. Nothing is sent before this has finished. */
export function initAnalytics(): Promise<void> {
  ready ??= (async () => {
    try {
      prefs = (await (await getRepository()).getSettings()).analytics ?? {}
    } catch {
      prefs = {}
    }
    analyticsStore.set({ optOut: prefs.optOut === true })
  })()
  return ready
}

async function whenReady(): Promise<boolean> {
  if (!analyticsEnabled()) return false
  await initAnalytics()
  return true
}

/** Fire-and-forget event. */
export function track(event: AnalyticsEvent): void {
  void whenReady().then((on) => on && transmit({ path: event, title: event, event: true }))
}

/** The app was opened: a page view of `/` (with the coarse screen size and a clean referrer). */
export function trackAppOpen(): void {
  void whenReady().then((on) => {
    if (!on) return
    transmit({
      path: pagePath(location.pathname, import.meta.env.BASE_URL),
      title: 'NCP Mobile Calc',
      event: false,
      referrer: cleanReferrer(document.referrer, location.origin) || undefined,
      screen: screenBucket(window.innerWidth, window.innerHeight),
    })
  })
}

// ---------------------------------------------------------------------------------------------
// Opt-out and device-local flags
// ---------------------------------------------------------------------------------------------

async function savePrefs(): Promise<void> {
  try {
    await (await getRepository()).setSettings({ analytics: { ...prefs } })
  } catch {
    /* storage unavailable: the choice just is not remembered */
  }
}

export function setStatsOptOut(optOut: boolean): void {
  analyticsStore.set({ optOut }) // effective immediately
  // Merged into the stored preferences once those are loaded (the load must not undo this).
  void initAnalytics().then(() => {
    prefs = { ...prefs, optOut }
    if (!optOut) delete prefs.optOut
    analyticsStore.set({ optOut })
    return savePrefs()
  })
}

/** `share-open` for a shared link that was applied; `share-open-new` only on a fresh device. */
export function trackShareOpen(): void {
  track('share-open')
  // Decided at boot, before anything was stored; reported at most once per page load.
  if (isFreshDevice() && !freshUsed) {
    freshUsed = true
    track('share-open-new')
  }
}

// ---------------------------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------------------------

let started = false
let unsubscribe: (() => void) | undefined
let lastGen: string | undefined

/** Call once at start-up: app-open, generation / regulation events, first standalone start. */
export function startAnalytics(): void {
  if (started || !analyticsEnabled()) return
  started = true
  void initAnalytics()
  trackAppOpen()
  const onStore = () => {
    const s = store.get()
    if (!s.booted) return
    const key = `${s.gen}/${s.regulation}`
    if (key === lastGen) return
    lastGen = key
    if (sentGen.has(key)) return
    sentGen.add(key)
    track(`gen/${key}`)
  }
  unsubscribe = store.subscribe(onStore)
  onStore()
  void initApp().then(async () => {
    await initAnalytics()
    if (prefs.standaloneSent || prefs.optOut || !isStandalone(readEnv())) return
    if (!mayTransmit()) return
    prefs = { ...prefs, standaloneSent: true }
    track('install/standalone')
    await savePrefs()
  })
}

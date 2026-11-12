/**
 * The "install as app" banner and menu entry.
 *
 * `beforeinstallprompt` can fire before React renders, so `registerInstallListeners()` runs from
 * main.tsx and keeps the event here. The banner is shown at most twice (a 30 day pause after the
 * first close); dismissals live in the device settings (never in a backup). While the banner has
 * been shown in this session the coffee nudge stays away (see features/matchup/SupportNudge).
 */
import { detectPlatform, readEnv, type PlatformEnv, type PlatformKind } from '../install/platform'
import type { InstallPrompt } from '../storage/types'
import { getRepository } from './app'
import { createStore, useStore } from './store'

export const REPEAT_AFTER_MS = 30 * 24 * 60 * 60 * 1000
export const MAX_DISMISSALS = 2

/** The (non-standard) Chromium event. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>
}

export interface InstallState {
  loaded: boolean
  kind: PlatformKind
  /** A usable `beforeinstallprompt` event is held. */
  hasEvent: boolean
  installed: boolean
  dismissCount: number
  dismissedAt?: number
  /** The banner was visible at some point in this session (the coffee nudge then waits). */
  bannerShown: boolean
}

const initial = (): InstallState => ({
  loaded: false,
  kind: 'desktop',
  hasEvent: false,
  installed: false,
  dismissCount: 0,
  bannerShown: false,
})

export const installStore = createStore<InstallState>(initial())

export function useInstall<T>(selector: (s: InstallState) => T): T {
  return useStore(installStore, selector)
}

let deferred: BeforeInstallPromptEvent | undefined
let initPromise: Promise<void> | undefined
let listening: EventTarget | undefined

/** Call once, before React renders. */
export function registerInstallListeners(target: EventTarget = window): void {
  if (listening === target) return
  listening = target
  target.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // we show our own UI
    deferred = e as BeforeInstallPromptEvent
    installStore.set({ hasEvent: true })
  })
  target.addEventListener('appinstalled', () => {
    deferred = undefined
    installStore.set({ hasEvent: false, installed: true })
    void persist()
  })
}

async function persist(): Promise<void> {
  const { dismissCount, dismissedAt, installed } = installStore.get()
  const value: InstallPrompt = { dismissCount }
  if (dismissedAt !== undefined) value.dismissedAt = dismissedAt
  if (installed) value.installed = true
  try {
    await (await getRepository()).setSettings({ installPrompt: value })
  } catch {
    /* storage unavailable: just not remembered */
  }
}

/** Reads the persisted state and the platform; safe to call repeatedly. */
export function initInstall(env: PlatformEnv = readEnv()): Promise<void> {
  initPromise ??= (async () => {
    const kind = detectPlatform(env)
    try {
      const s = (await (await getRepository()).getSettings()).installPrompt
      installStore.set({
        dismissCount: s?.dismissCount ?? 0,
        dismissedAt: s?.dismissedAt,
        // an `appinstalled` that fired before loading wins over the stored value
        installed: installStore.get().installed || s?.installed === true,
      })
    } catch {
      /* defaults */
    }
    installStore.set({ kind, loaded: true })
  })()
  return initPromise
}

/** Pure: may the banner be shown now? */
export function bannerEligible(s: InstallState, now: number): boolean {
  if (!s.loaded || s.installed || s.dismissCount >= MAX_DISMISSALS) return false
  if (s.dismissCount > 0 && now - (s.dismissedAt ?? 0) < REPEAT_AFTER_MS) return false
  return s.kind === 'ios' || (s.kind === 'android' && s.hasEvent)
}

export type MenuInstall = 'prompt' | 'ios' | 'manual'

/** Pure: which install entry belongs in the menu (undefined: none). */
export function menuInstall(s: InstallState): MenuInstall | undefined {
  if (!s.loaded || s.installed || s.kind === 'standalone' || s.kind === 'inapp') return undefined
  if (s.hasEvent) return 'prompt'
  if (s.kind === 'ios') return 'ios'
  if (s.kind === 'android') return 'manual'
  return undefined
}

export function markBannerShown(): void {
  if (!installStore.get().bannerShown) installStore.set({ bannerShown: true })
}

/** The banner's close button (or the native dialog being dismissed). */
export function dismissBanner(now: number = Date.now()): void {
  installStore.set({ dismissCount: installStore.get().dismissCount + 1, dismissedAt: now })
  void persist()
}

/**
 * Opens the native install dialog. The event is single-use, so the entry disappears until the
 * browser offers a new one. `countDismissal`: a dismissed dialog counts like the banner's close.
 */
export async function promptInstall(
  countDismissal = true,
): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = deferred
  if (!ev) return 'unavailable'
  deferred = undefined
  installStore.set({ hasEvent: false })
  try {
    await ev.prompt()
    const { outcome } = await ev.userChoice
    if (outcome === 'accepted') {
      installStore.set({ installed: true })
      void persist()
      return 'accepted'
    }
    if (countDismissal) dismissBanner()
    return 'dismissed'
  } catch {
    return 'dismissed'
  }
}

/** Test helper. */
export function resetInstall(): void {
  deferred = undefined
  initPromise = undefined
  installStore.replace(initial())
}

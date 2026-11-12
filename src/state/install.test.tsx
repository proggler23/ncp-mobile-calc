import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallBanner } from '../features/install/InstallBanner'
import { SupportNudge } from '../features/matchup/SupportNudge'
import { MenuSheet } from '../features/menu/MenuSheet'
import type { PlatformEnv } from '../install/platform'
import { getRepository } from '../storage'
import { resetAll } from '../test-utils'
import { acquireOverlay, releaseOverlay, resetOverlays } from '../ui/overlayStack'
import {
  REPEAT_AFTER_MS,
  bannerEligible,
  initInstall,
  installStore,
  menuInstall,
  registerInstallListeners,
  type BeforeInstallPromptEvent,
} from './install'
import { supportStore } from './supportNudge'

const ANDROID: PlatformEnv = {
  ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
  platform: 'Linux armv81',
  maxTouchPoints: 5,
  matches: () => false,
}
const IOS: PlatformEnv = {
  ...ANDROID,
  ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
  platform: 'iPhone',
}
const FIREFOX_ANDROID: PlatformEnv = {
  ...ANDROID,
  ua: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
}
const DESKTOP: PlatformEnv = {
  ...ANDROID,
  ua: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0',
  maxTouchPoints: 0,
}

let target: EventTarget
let prompt: ReturnType<typeof vi.fn>

function fireEventObj(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent
  prompt = vi.fn().mockResolvedValue(undefined)
  e.prompt = prompt as never
  e.userChoice = Promise.resolve({ outcome })
  act(() => void target.dispatchEvent(e))
  return e
}

async function boot(env: PlatformEnv) {
  await act(() => initInstall(env))
}

const stored = async () => (await (await getRepository()).getSettings()).installPrompt

beforeEach(async () => {
  await resetAll({ gen: 'sv' })
  resetOverlays()
  target = new EventTarget()
  registerInstallListeners(target)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('eligibility', () => {
  it('Android needs the event; iOS does not; desktop never', async () => {
    await boot(ANDROID)
    expect(bannerEligible(installStore.get(), Date.now())).toBe(false)
    const e = fireEventObj()
    expect(e.defaultPrevented).toBe(true)
    expect(bannerEligible(installStore.get(), Date.now())).toBe(true)
    cleanup()
    installStore.set({ kind: 'desktop' })
    expect(bannerEligible(installStore.get(), Date.now())).toBe(false)
  })

  it('iOS shows it without an event; in-app/standalone never', async () => {
    await boot(IOS)
    expect(bannerEligible(installStore.get(), Date.now())).toBe(true)
    installStore.set({ kind: 'inapp' })
    expect(bannerEligible(installStore.get(), Date.now())).toBe(false)
    installStore.set({ kind: 'standalone' })
    expect(bannerEligible(installStore.get(), Date.now())).toBe(false)
  })

  it('stays hidden until settings are loaded', () => {
    installStore.set({ kind: 'ios' })
    expect(bannerEligible(installStore.get(), Date.now())).toBe(false)
  })
})

describe('banner', () => {
  it('Install calls prompt(); accepted hides it permanently', async () => {
    await boot(ANDROID)
    render(<InstallBanner />)
    expect(screen.queryByRole('region', { name: 'Install app' })).toBeNull()
    fireEventObj('accepted')
    expect(await screen.findByText('📲 Install as app – works offline')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Install app' })).toBeNull())
    await waitFor(async () => expect((await stored())?.installed).toBe(true))
  })

  it('a dismissed native dialog counts like the close button', async () => {
    await boot(ANDROID)
    render(<InstallBanner />)
    fireEventObj('dismissed')
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Install app' })).toBeNull())
    await waitFor(async () => expect((await stored())?.dismissCount).toBe(1))
  })

  it('close hides for 30 days, then once more; the second close is final', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await boot(IOS)
    render(<InstallBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Hide install hint' }))
    expect(screen.queryByRole('region', { name: 'Install app' })).toBeNull()
    expect(bannerEligible(installStore.get(), Date.now() + REPEAT_AFTER_MS - 1)).toBe(false)
    expect(bannerEligible(installStore.get(), Date.now() + REPEAT_AFTER_MS)).toBe(true)

    await waitFor(async () => expect((await stored())?.dismissCount).toBe(1))
    // a new session after 30 days reads the persisted state
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'))
    cleanup()
    const { resetInstall } = await import('./install')
    resetInstall()
    await boot(IOS)
    render(<InstallBanner />)
    expect(screen.getByRole('region', { name: 'Install app' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide install hint' }))
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    expect(bannerEligible(installStore.get(), Date.now())).toBe(false)
    await waitFor(async () => expect((await stored())?.dismissCount).toBe(2))
  })

  it('iOS shows How? which opens the instructions sheet', async () => {
    await boot(IOS)
    render(<InstallBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'How?' }))
    const dialog = screen.getByRole('dialog', { name: 'Install as app' })
    expect(dialog).toHaveTextContent('Add to Home Screen')
    expect(screen.getByRole('region', { name: 'Install app' })).toBeInTheDocument() // still there
  })

  it('is German when the language is German', async () => {
    const { store } = await import('./app')
    act(() => store.set({ lang: 'de' }))
    await boot(IOS)
    render(<InstallBanner />)
    expect(screen.getByText('📲 Als App installieren – funktioniert offline')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wie?' })).toBeInTheDocument()
    act(() => store.set({ lang: 'en' }))
  })

  it('does not appear for the first time while an overlay is open, and stays once shown', async () => {
    await boot(IOS)
    act(() => acquireOverlay(1, () => {}))
    render(<InstallBanner />)
    expect(screen.queryByRole('region', { name: 'Install app' })).toBeNull()
    act(() => {
      releaseOverlay(1)
    })
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Install app' })).toBeInTheDocument(),
    )
    act(() => acquireOverlay(2, () => {}))
    expect(screen.getByRole('region', { name: 'Install app' })).toBeInTheDocument()
  })

  it('appinstalled hides it and removes the menu entry', async () => {
    await boot(ANDROID)
    fireEventObj()
    render(
      <>
        <InstallBanner />
        <MenuSheet onClose={() => {}} />
      </>,
    )
    expect(screen.getByRole('button', { name: '📲 Install app' })).toBeInTheDocument()
    act(() => void target.dispatchEvent(new Event('appinstalled')))
    expect(screen.queryByRole('region', { name: 'Install app' })).toBeNull()
    expect(screen.queryByRole('button', { name: '📲 Install app' })).toBeNull()
    await waitFor(async () => expect((await stored())?.installed).toBe(true))
  })
})

describe('menu entry', () => {
  it('menuInstall by platform', async () => {
    await boot(FIREFOX_ANDROID)
    expect(menuInstall(installStore.get())).toBe('manual')
    installStore.set({ kind: 'ios' })
    expect(menuInstall(installStore.get())).toBe('ios')
    installStore.set({ kind: 'desktop' })
    expect(menuInstall(installStore.get())).toBeUndefined()
    installStore.set({ kind: 'inapp' })
    expect(menuInstall(installStore.get())).toBeUndefined()
    installStore.set({ kind: 'standalone', hasEvent: true })
    expect(menuInstall(installStore.get())).toBeUndefined()
  })

  it('Chromium: the entry prompts and survives banner dismissals', async () => {
    await boot(ANDROID)
    installStore.set({ dismissCount: 2, dismissedAt: Date.now() })
    fireEventObj()
    render(<MenuSheet onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '📲 Install app' }))
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce())
  })

  it('iOS: opens the instructions', async () => {
    await boot(IOS)
    render(<MenuSheet onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '📲 Install app' }))
    expect(screen.getByRole('dialog', { name: 'Install as app' })).toBeInTheDocument()
  })

  it('Android without the event: generic instruction text, no button', async () => {
    await boot(FIREFOX_ANDROID)
    render(<MenuSheet onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: '📲 Install app' })).toBeNull()
    expect(screen.getByText(/Add to Home screen/)).toBeInTheDocument()
  })

  it('desktop Chromium with a captured event: entry prompts, no banner', async () => {
    await boot(DESKTOP)
    fireEventObj()
    expect(menuInstall(installStore.get())).toBe('prompt')
    expect(bannerEligible(installStore.get(), Date.now())).toBe(false)
    render(<MenuSheet onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '📲 Install app' }))
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce())
  })

  it('desktop: no entry', async () => {
    await boot(DESKTOP)
    render(<MenuSheet onClose={() => {}} />)
    expect(screen.queryByText(/📲/)).toBeNull()
  })
})

describe('coffee nudge coordination', () => {
  it('is shown without the banner, suppressed once the banner showed this session', async () => {
    await boot(IOS)
    act(() => supportStore.set({ due: true }))
    const { unmount } = render(<SupportNudge />)
    expect(screen.getByRole('region', { name: 'Support the project' })).toBeInTheDocument()
    unmount()
    render(
      <>
        <InstallBanner />
        <SupportNudge />
      </>,
    )
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Install app' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('region', { name: 'Support the project' })).toBeNull()
    // dismissing the banner does not bring it back in the same session
    fireEvent.click(screen.getByRole('button', { name: 'Hide install hint' }))
    expect(screen.queryByRole('region', { name: 'Support the project' })).toBeNull()
    expect(supportStore.get().due).toBe(true) // it just waits
  })
})

describe('backup', () => {
  it('excludes installPrompt from export and ignores it on import', async () => {
    const repo = await getRepository()
    await repo.setSettings({ installPrompt: { dismissCount: 1, dismissedAt: 5 } })
    const exported = JSON.parse(await repo.exportBackup()) as { settings?: Record<string, unknown> }
    expect(exported.settings).not.toHaveProperty('installPrompt')
    const file = JSON.stringify({
      app: 'ncp-mobile-calc',
      version: 1,
      teams: [],
      customSets: [],
      settings: { lang: 'en', gen: 'sv', format: 'doubles', installPrompt: { dismissCount: 9 } },
    })
    await repo.importBackup(file, 'merge')
    expect((await repo.getSettings()).installPrompt).toEqual({ dismissCount: 1, dismissedAt: 5 })
  })

  it('falls back safely on a broken stored value', async () => {
    const repo = await getRepository()
    await repo.setSettings({ installPrompt: { dismissCount: -3 } as never }).catch(() => {})
    await boot(IOS)
    expect(installStore.get().dismissCount).toBeGreaterThanOrEqual(0)
  })
})

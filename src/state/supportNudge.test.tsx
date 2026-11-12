import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { SupportNudge } from '../features/matchup/SupportNudge'
import { SupportButton } from '../ui/SupportButton'
import { SUPPORT_URL } from '../config'
import { acquireOverlay, releaseOverlay, resetOverlays } from '../ui/overlayStack'
import { getRepository } from '../storage'
import { resetAll } from '../test-utils'
import { initApp, patchField, setMatchup, store } from './app'
import {
  CALC_DEBOUNCE_MS,
  LATER_CALCS,
  LATER_MS,
  dismissSupportForever,
  initSupportNudge,
  isDue,
  resetSupportNudge,
  snoozeSupport,
  supportStore,
} from './supportNudge'
import { blankSet } from './sets'
import { createTeam, saveToTeam } from './teams'

const DAY = 24 * 60 * 60 * 1000

async function boot() {
  await initApp()
  await initSupportNudge()
}

/** One "calculation": a field change that stays stable for the debounce time. */
function calc(i: number) {
  act(() => patchField((f) => ({ ...f, gravity: i % 2 === 0 })))
  act(() => void vi.advanceTimersByTime(CALC_DEBOUNCE_MS))
}

async function stored() {
  return (await (await getRepository()).getSettings()).supportNudge
}

beforeEach(async () => {
  await resetAll({ gen: 'sv' })
  resetOverlays()
  await boot()
  setMatchup(
    { ...blankSet('sv', 'garchomp'), moveIds: ['earthquake'] },
    { ...blankSet('sv', 'koraidon'), moveIds: ['protect'] },
  )
  expect(store.get().calc).toBeDefined()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function fakeTime() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
}

/** Reaches the due state through 100 calculations. */
function reachDue() {
  fakeTime()
  for (let i = 0; i < 100; i++) calc(i)
  expect(supportStore.get().due).toBe(true)
}

describe('isDue', () => {
  it('follows the rules', () => {
    const base = { calcCount: 0, snoozeCount: 0 }
    expect(isDue({ state: 'pending', ...base }, 0)).toBe(false)
    expect(isDue({ state: 'pending', ...base, calcCount: 100 }, 0)).toBe(true)
    expect(isDue({ state: 'pending', ...base, triggered: true }, 0)).toBe(true)
    expect(isDue({ state: 'done', ...base, calcCount: 999, triggered: true }, 0)).toBe(false)
  })
})

describe('support nudge triggers', () => {
  it('fires when a team first gets a member (create with members / save to team)', async () => {
    expect(supportStore.get().due).toBe(false)
    const empty = await createTeam('Empty', 'sv')
    expect(supportStore.get().due).toBe(false) // no member yet
    await saveToTeam(empty.uid, blankSet('sv', 'garchomp'))
    expect(supportStore.get().due).toBe(true)
    await waitFor(async () => expect((await stored())?.triggered).toBe(true))
  })

  it('fires for a team created with members', async () => {
    const m = store.get().mine!
    const t = await createTeam('Full', 'sv')
    expect(supportStore.get().due).toBe(false)
    await saveToTeam(t.uid, m)
    expect(supportStore.get().due).toBe(true)
  })

  it('fires after 100 debounced calculations; rapid changes count once', () => {
    fakeTime()
    for (let i = 0; i < 99; i++) calc(i)
    expect(supportStore.get().due).toBe(false)
    // ten rapid taps inside the debounce window are a single calculation
    for (let i = 0; i < 10; i++) {
      act(() => patchField((f) => ({ ...f, gravity: i % 2 === 1 })))
      act(() => void vi.advanceTimersByTime(100))
    }
    act(() => void vi.advanceTimersByTime(CALC_DEBOUNCE_MS))
    expect(supportStore.get().due).toBe(true) // 99 + 1 = 100, not 109
  })

  it('99 plus one burst is not enough for 100 when the burst is only one', () => {
    fakeTime()
    for (let i = 0; i < 98; i++) calc(i)
    for (let i = 0; i < 10; i++) act(() => patchField((f) => ({ ...f, gravity: i % 2 === 1 })))
    act(() => void vi.advanceTimersByTime(CALC_DEBOUNCE_MS))
    expect(supportStore.get().due).toBe(false) // 99
  })
})

describe('support nudge display', () => {
  it('is hidden while an overlay is open and shown once it closes', async () => {
    reachDue()
    vi.useRealTimers()
    render(<SupportNudge />)
    expect(screen.getByRole('region', { name: 'Support the project' })).toBeVisible()
    act(() => acquireOverlay(4242, () => {}))
    expect(screen.queryByRole('region', { name: 'Support the project' })).toBeNull()
    act(() => releaseOverlay(4242))
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Support the project' })).toBeVisible(),
    )
  })

  it('renders localized text and a safe external link', () => {
    act(() => store.set({ lang: 'de' }))
    reachDue()
    render(<SupportNudge />)
    expect(screen.getByText('Schön, dass dir der Calc hilft! ☕')).toBeVisible()
    const link = screen.getByRole('link', { name: '☕ Kaffee spendieren' })
    expect(link).toHaveAttribute('href', SUPPORT_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('button', { name: 'Später' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Nie' })).toBeVisible()
  })

  it('Buy a coffee ends the nudge for good', async () => {
    reachDue()
    render(<SupportNudge />)
    fireEvent.click(screen.getByRole('link', { name: '☕ Buy a coffee' }))
    act(() => void vi.advanceTimersByTime(500))
    expect(screen.queryByRole('region')).toBeNull()
    vi.useRealTimers()
    await waitFor(async () => expect((await stored())?.state).toBe('done'))
  })

  it('Never ends the nudge for good and survives a re-init', async () => {
    reachDue()
    render(<SupportNudge />)
    fireEvent.click(screen.getByRole('button', { name: 'Never' }))
    expect(screen.queryByRole('region')).toBeNull()
    vi.useRealTimers()
    await waitFor(async () => expect((await stored())?.state).toBe('done'))
    resetSupportNudge()
    await initSupportNudge()
    expect(supportStore.get().due).toBe(false)
    fakeTime()
    for (let i = 0; i < 120; i++) calc(i)
    expect(supportStore.get().due).toBe(false)
  })
})

describe('Later', () => {
  it('waits for 150 more calculations and 14 days; the 3rd Later is final', async () => {
    reachDue()
    const start = Date.now()
    act(() => snoozeSupport())
    expect(supportStore.get().due).toBe(false)

    // calculations alone are not enough
    for (let i = 0; i < LATER_CALCS; i++) calc(i)
    expect(supportStore.get().due).toBe(false)
    // days alone are not enough either ...
    vi.setSystemTime(start + LATER_MS + DAY)
    expect(supportStore.get().due).toBe(false)
    // ... but both together are (next calculation re-evaluates)
    calc(1)
    expect(supportStore.get().due).toBe(true)

    act(() => snoozeSupport()) // 2nd
    expect(supportStore.get().due).toBe(false)
    vi.setSystemTime(Date.now() + LATER_MS + DAY)
    for (let i = 0; i < LATER_CALCS; i++) calc(i)
    expect(supportStore.get().due).toBe(true)

    act(() => snoozeSupport()) // 3rd -> done
    vi.setSystemTime(Date.now() + 10 * LATER_MS)
    for (let i = 0; i < 2 * LATER_CALCS; i++) calc(i)
    expect(supportStore.get().due).toBe(false)
    vi.useRealTimers()
    await waitFor(async () => expect((await stored())?.state).toBe('done'))
  })

  it('is not shown before the thresholds, also after a reload', async () => {
    reachDue()
    act(() => snoozeSupport())
    vi.useRealTimers()
    await waitFor(async () => expect((await stored())?.state).toBe('snoozed'))
    resetSupportNudge()
    await initSupportNudge()
    expect(supportStore.get().due).toBe(false)
    expect((await stored())?.snoozeCount).toBe(1)
  })
})

describe('persistence and backups', () => {
  it('persists the count in batches and restores it', async () => {
    fakeTime()
    for (let i = 0; i < 25; i++) calc(i)
    vi.useRealTimers()
    await waitFor(async () => expect((await stored())?.calcCount).toBe(20))
    const repo = await getRepository()
    // simulate a reload that kept the stored value
    resetSupportNudge()
    await initSupportNudge()
    fakeTime()
    for (let i = 0; i < 80; i++) calc(i)
    expect(supportStore.get().due).toBe(true) // 20 + 80
    expect(repo).toBeTruthy()
  })

  it('a backup import neither changes nor exports the nudge state', async () => {
    const repo = await getRepository()
    act(() => dismissSupportForever())
    await waitFor(async () => expect((await stored())?.state).toBe('done'))
    await repo.setSettings({ menuSeen: true })
    const exported = JSON.parse(await repo.exportBackup())
    expect(exported.settings.supportNudge).toBeUndefined()
    expect(exported.settings.menuSeen).toBeUndefined()

    const evil = {
      ...exported,
      settings: {
        ...exported.settings,
        supportNudge: { state: 'pending', calcCount: 0, snoozeCount: 0 },
        menuSeen: false,
      },
    }
    for (const mode of ['merge', 'replace'] as const) {
      await repo.importBackup(JSON.stringify(evil), mode)
      const s = await repo.getSettings()
      expect(s.supportNudge?.state).toBe('done')
      expect(s.menuSeen).toBe(true)
    }
  })
})

describe('menu dot', () => {
  it('shows until the menu was opened once, also after re-init', async () => {
    render(<App />)
    await waitFor(() => expect(document.querySelector('.matchup')).not.toBeNull())
    const btn = await screen.findByRole('button', { name: 'Menu (new)' })
    expect(btn.querySelector('.topbar__dot')).not.toBeNull()
    fireEvent.click(btn)
    expect(await screen.findByRole('button', { name: 'Menu' })).toBeVisible()
    expect(document.querySelector('.topbar__dot')).toBeNull()
    await waitFor(async () => expect((await repoSettings()).menuSeen).toBe(true))
    cleanup()
    resetSupportNudge()
    render(<App />)
    await waitFor(() => expect(supportStore.get().loaded).toBe(true))
    await waitFor(() => expect(document.querySelector('.matchup')).not.toBeNull())
    expect(screen.getByRole('button', { name: 'Menu' })).toBeVisible()
    expect(document.querySelector('.topbar__dot')).toBeNull()
  })
})

async function repoSettings() {
  return (await getRepository()).getSettings()
}

describe('SupportButton', () => {
  it('has the yellow contrast class and safe link attributes', () => {
    render(<SupportButton>Coffee</SupportButton>)
    const a = screen.getByRole('link', { name: 'Coffee' })
    expect(a).toHaveClass('btn', 'btn--support')
    expect(a).toHaveAttribute('href', SUPPORT_URL)
    expect(a).toHaveAttribute('target', '_blank')
    expect(a).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

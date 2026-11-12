/**
 * The one-time "support the project" nudge and the "new" dot on the menu button.
 *
 * Everything is local: the state lives in the device settings (never in a backup) and nothing is
 * sent anywhere. A "calculation" is a matchup change that stays untouched for CALC_DEBOUNCE_MS, so
 * rapid taps count once. The count is kept in memory and written at most every PERSIST_EVERY
 * calculations (and when the page is hidden); state changes are written immediately.
 */
import type { SupportNudge } from '../storage/types'
import { getRepository, store, type AppState } from './app'
import { createStore, useStore } from './store'

export const CALC_DEBOUNCE_MS = 2000
export const FIRST_NUDGE_CALCS = 100
export const LATER_CALCS = 150
export const LATER_MS = 14 * 24 * 60 * 60 * 1000
export const MAX_LATER = 3
const PERSIST_EVERY = 10
const MAX_COUNT = 1_000_000

export interface SupportState {
  loaded: boolean
  /** The nudge is due (it is only rendered while no overlay is open). */
  due: boolean
  menuSeen: boolean
}

export const supportStore = createStore<SupportState>({ loaded: false, due: false, menuSeen: true })

export function useSupport<T>(selector: (s: SupportState) => T): T {
  return useStore(supportStore, selector)
}

const fresh = (): SupportNudge => ({ state: 'pending', calcCount: 0, snoozeCount: 0 })

let nudge: SupportNudge = fresh()
let unsaved = 0
let calcTimer: ReturnType<typeof setTimeout> | undefined
let initPromise: Promise<void> | undefined
const refs = (s: AppState) => [s.gen, s.format, s.mine, s.opp, s.field]
let seenRefs: unknown[] = []
let wasBooted = false

/** Pure: should the nudge be shown now? */
export function isDue(n: SupportNudge, now: number): boolean {
  if (n.state === 'done') return false
  if (n.state === 'pending') return !!n.triggered || n.calcCount >= FIRST_NUDGE_CALCS
  return (
    n.snoozeCount < MAX_LATER &&
    n.calcCount - (n.snoozedAtCount ?? 0) >= LATER_CALCS &&
    now - (n.snoozedAt ?? now) >= LATER_MS
  )
}

async function save(patch: { supportNudge?: SupportNudge; menuSeen?: boolean }): Promise<void> {
  try {
    await (await getRepository()).setSettings(patch)
  } catch {
    /* storage unavailable: the nudge just is not remembered */
  }
}

function saveNudge(): void {
  unsaved = 0
  void save({ supportNudge: { ...nudge } })
}

function evaluate(): void {
  const due = isDue(nudge, Date.now())
  if (due !== supportStore.get().due) supportStore.set({ due })
}

/** Reads the persisted state; safe to call repeatedly. */
export function initSupportNudge(): Promise<void> {
  initPromise ??= (async () => {
    try {
      const s = await (await getRepository()).getSettings()
      nudge = s.supportNudge ? { ...s.supportNudge } : fresh()
      supportStore.set({ menuSeen: s.menuSeen === true })
    } catch {
      nudge = fresh()
      supportStore.set({ menuSeen: true }) // no storage: do not nag with a dot that never clears
    }
    supportStore.set({ loaded: true })
    evaluate()
  })()
  return initPromise
}

/** Test helper: forget everything in memory (storage is untouched). */
export function resetSupportNudge(): void {
  clearTimeout(calcTimer)
  calcTimer = undefined
  nudge = fresh()
  unsaved = 0
  initPromise = undefined
  seenRefs = refs(store.get())
  wasBooted = store.get().booted
  supportStore.replace({ loaded: false, due: false, menuSeen: true })
}

function countCalc(): void {
  if (!supportStore.get().loaded || nudge.state === 'done') return
  nudge.calcCount = Math.min(nudge.calcCount + 1, MAX_COUNT)
  unsaved++
  const was = supportStore.get().due
  evaluate()
  if (supportStore.get().due !== was || unsaved >= PERSIST_EVERY) saveNudge()
}

/** A team has `memberCount` members persisted now (create, import, add, save-to-team, ...). */
export function noteTeamSaved(memberCount: number): void {
  if (!supportStore.get().loaded || memberCount < 1) return
  if (nudge.state !== 'pending' || nudge.triggered) return
  nudge.triggered = true
  evaluate()
  saveNudge()
}

/** "Buy a coffee" / "Never". */
export function dismissSupportForever(): void {
  nudge = { ...nudge, state: 'done', triggered: false }
  evaluate()
  saveNudge()
}

/** "Later": back after LATER_CALCS more calculations and LATER_MS; the 3rd "Later" is final. */
export function snoozeSupport(): void {
  const snoozeCount = nudge.snoozeCount + 1
  nudge = {
    ...nudge,
    state: snoozeCount >= MAX_LATER ? 'done' : 'snoozed',
    snoozeCount,
    snoozedAt: Date.now(),
    snoozedAtCount: nudge.calcCount,
    triggered: false,
  }
  evaluate()
  saveNudge()
}

export function markMenuSeen(): void {
  if (supportStore.get().menuSeen) return
  supportStore.set({ menuSeen: true })
  void save({ menuSeen: true })
}

store.subscribe(() => {
  const s = store.get()
  const next = refs(s)
  const changed = next.some((v, i) => v !== seenRefs[i])
  seenRefs = next
  const booted = wasBooted
  wasBooted = s.booted
  // Restoring the saved matchup at start-up is not a calculation by the user.
  if (!changed || !booted || !s.calc) return
  clearTimeout(calcTimer)
  calcTimer = setTimeout(() => {
    if (store.get().calc) countCalc()
  }, CALC_DEBOUNCE_MS)
})

if (typeof document !== 'undefined') {
  const flush = () => {
    if (unsaved > 0) saveNudge()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
}

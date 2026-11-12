/**
 * History-backed overlay stack: the browser/Android back button closes the topmost sheet instead
 * of leaving the app.
 *
 * Every open overlay owns one history entry (`pushState`, same URL). Closing an overlay from the UI
 * removes that entry again with `history.back()` (its popstate is swallowed); pressing back pops the
 * entry itself, and `popstate` then closes the topmost overlay.
 *
 * React StrictMode runs effects mount -> cleanup -> mount. Releasing is therefore deferred to a
 * macrotask: a re-acquire of the same owner id in between simply cancels the release, so no history
 * entry is pushed twice and no `back()` races a `pushState`.
 */

interface Entry {
  id: number
  close: () => void
  /** Released by its owner while a higher overlay is open: its history slot is still there. */
  dead: boolean
  /** Release scheduled (deferred) but not yet performed. */
  releasing: boolean
}

let stack: Entry[] = []
/** Number of programmatic `history.back()` calls whose popstate must be ignored. */
let ignorePops = 0
/** Safety net: a programmatic `history.back()` whose popstate never arrives must not stick. */
const IGNORE_POPS_TIMEOUT_MS = 1000
let ignoreTimer: ReturnType<typeof setTimeout> | undefined
let listening = false
let seq = 0

export function nextOverlayId(): number {
  return ++seq
}

/** Performs `history.back()` and swallows its popstate (with a timeout if it never comes). */
function backIgnoringPop(): void {
  ignorePops++
  history.back()
  clearTimeout(ignoreTimer)
  ignoreTimer = setTimeout(() => {
    ignoreTimer = undefined
    if (ignorePops > 0) {
      ignorePops = 0
      flushWaiting()
    }
  }, IGNORE_POPS_TIMEOUT_MS)
}

function ensureListener(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('popstate', onPop)
}

/** Callbacks waiting for all overlay history entries to be gone (see `whenOverlaysSettled`). */
let waiting: (() => void)[] = []

function isSettled(): boolean {
  return stack.length === 0 && ignorePops === 0
}

function flushWaiting(): void {
  if (!isSettled()) return
  const run = waiting
  waiting = []
  run.forEach((fn) => fn())
}

/**
 * Runs `fn` once no overlay owns a history entry any more. Navigating while a sheet is closing
 * would otherwise let the sheet's deferred `history.back()` undo the navigation. Falls back to a
 * short timeout so a navigation is never lost when an overlay genuinely stays open.
 */
export function whenOverlaysSettled(fn: () => void): void {
  if (isSettled()) return fn()
  let done = false
  const once = () => {
    if (done) return
    done = true
    fn()
  }
  waiting.push(once)
  setTimeout(() => {
    waiting = waiting.filter((w) => w !== once)
    once()
  }, 300)
}

function onPop(): void {
  if (ignorePops > 0) {
    ignorePops--
    if (ignorePops === 0) clearTimeout(ignoreTimer)
    flushWaiting()
    return
  }
  const top = stack.pop()
  if (!top) return
  if (top.dead) {
    // Nothing visible belonged to this slot: keep going back to the next real overlay / page.
    onDeadPopped()
    return
  }
  top.close()
  drainDead()
  flushWaiting()
}

function onDeadPopped(): void {
  const next = stack[stack.length - 1]
  if (next?.dead) {
    stack.pop()
    backIgnoringPop()
    drainDead()
  }
}

/** Dead entries on top of the stack are removed together with their history slots. */
function drainDead(): void {
  while (stack.length && stack[stack.length - 1]!.dead) {
    stack.pop()
    backIgnoringPop()
  }
}

/**
 * Registers an overlay. Idempotent per `id`: acquiring while a release is pending re-activates the
 * entry. `close` is called (once) when the user navigates back.
 */
export function acquireOverlay(id: number, close: () => void): void {
  ensureListener()
  const existing = stack.find((e) => e.id === id)
  if (existing) {
    existing.releasing = false
    existing.dead = false
    existing.close = close
    return
  }
  stack.push({ id, close, dead: false, releasing: false })
  history.pushState({ ...(history.state as object | null), ncpOverlay: id }, '')
}

/** Updates the close callback without touching history. */
export function updateOverlay(id: number, close: () => void): void {
  const e = stack.find((x) => x.id === id)
  if (e) e.close = close
}

/** Deferred release (see the module comment). */
export function releaseOverlay(id: number): void {
  const e = stack.find((x) => x.id === id)
  if (!e) return
  e.releasing = true
  setTimeout(() => finalizeRelease(id), 0)
}

function finalizeRelease(id: number): void {
  const idx = stack.findIndex((x) => x.id === id)
  const e = stack[idx]
  if (!e || !e.releasing) return
  if (idx === stack.length - 1) {
    stack.pop()
    backIgnoringPop()
    drainDead()
  } else {
    e.dead = true
    e.releasing = false
  }
}

export function overlayDepth(): number {
  return stack.filter((e) => !e.dead).length
}

/** Test helper. */
export function resetOverlays(): void {
  stack = []
  ignorePops = 0
  clearTimeout(ignoreTimer)
  waiting = []
}

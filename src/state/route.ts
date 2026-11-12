/**
 * Minimal hash router with history-aware "back". Routes: `#/` (calculator), `#/teams`,
 * `#/teams/<uid>`. Entries created by `navigate` carry a depth in `history.state`, so `goBack` can
 * tell whether going back stays inside the app.
 */
import { useSyncExternalStore } from 'react'
import { whenOverlaysSettled } from '../ui/overlayStack'

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
let wired = false

function depth(): number {
  const d = (history.state as { ncpDepth?: unknown } | null)?.ncpDepth
  return typeof d === 'number' ? d : 0
}

function wire(): void {
  if (wired || typeof window === 'undefined') return
  wired = true
  window.addEventListener('popstate', emit)
  window.addEventListener('hashchange', emit)
}

export function currentRoute(): string {
  return (globalThis.location?.hash ?? '').replace(/^#\/?/, '')
}

function subscribe(fn: () => void): () => void {
  wire()
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, currentRoute, () => '')
}

/** Push a new route (`'/teams'`). */
export function navigate(path: string): void {
  whenOverlaysSettled(() => {
    history.pushState({ ncpDepth: depth() + 1 }, '', `#${path}`)
    emit()
  })
}

/** Go one step back inside the app, or replace the current entry with `fallback`. */
export function goBack(fallback = '/'): void {
  whenOverlaysSettled(() => {
    if (depth() > 0) history.back()
    else {
      history.replaceState({ ncpDepth: 0 }, '', `#${fallback}`)
      emit()
    }
  })
}

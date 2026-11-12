import { useSyncExternalStore } from 'react'

/** Tiny non-blocking message ("Copied"): one at a time, hides itself after `TOAST_MS`. */
export const TOAST_MS = 2000

let message = ''
let timer: ReturnType<typeof setTimeout> | undefined
const subs = new Set<() => void>()
const emit = () => subs.forEach((fn) => fn())

export function showToast(text: string): void {
  clearTimeout(timer)
  message = text
  emit()
  timer = setTimeout(() => {
    message = ''
    emit()
  }, TOAST_MS)
}

export function hideToast(): void {
  clearTimeout(timer)
  message = ''
  emit()
}

const subscribe = (fn: () => void) => {
  subs.add(fn)
  return () => subs.delete(fn)
}

/**
 * Mount once. The live region is always in the DOM (screen readers only announce changes to a
 * region that already exists), `aria-live=polite` so it never interrupts.
 */
export function ToastHost() {
  const text = useSyncExternalStore(
    subscribe,
    () => message,
    () => '',
  )
  return (
    <div className="toast-host" role="status" aria-live="polite" aria-atomic="true">
      {text && <p className="toast toast--float">{text}</p>}
    </div>
  )
}

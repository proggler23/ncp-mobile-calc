import { useSyncExternalStore } from 'react'

/** Wide viewport with a precise, hover-capable pointer (mouse): keep in sync with the CSS. */
export const DESKTOP_QUERY = '(min-width: 900px) and (hover: hover) and (pointer: fine)'

const mql = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DESKTOP_QUERY)
    : undefined

function subscribe(fn: () => void): () => void {
  const m = mql()
  m?.addEventListener?.('change', fn)
  return () => m?.removeEventListener?.('change', fn)
}

/** True on a desktop-class device (wide + mouse). Phones and tablets stay on the touch UI. */
export function useDesktopPointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => mql()?.matches ?? false,
    () => false,
  )
}

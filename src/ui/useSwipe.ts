import { useEffect, useMemo, useRef, type PointerEvent } from 'react'

/** Vertical finger travel (px) that counts as a swipe. */
export const SWIPE_THRESHOLD = 30

/**
 * Vertical swipe on an element (pointer events: touch, pen, mouse). Fires `onSwipeUp` /
 * `onSwipeDown` once per gesture as soon as the travel passes `threshold` and is mostly vertical.
 * A tap or click is untouched; the click that ends a swipe is swallowed. Pair with
 * `touch-action: none` on the element so the browser does not turn the swipe into a scroll.
 */
export function useSwipe(
  { onSwipeUp, onSwipeDown }: { onSwipeUp?: () => void; onSwipeDown?: () => void },
  threshold = SWIPE_THRESHOLD,
) {
  const origin = useRef<{ x: number; y: number } | undefined>(undefined)
  const swiped = useRef(false)
  const cb = useRef({ onSwipeUp, onSwipeDown })
  useEffect(() => {
    cb.current = { onSwipeUp, onSwipeDown }
  })
  return useMemo(
    () => ({
      onPointerDown(e: PointerEvent) {
        if (!e.isPrimary) return
        swiped.current = false
        origin.current = { x: e.clientX, y: e.clientY }
      },
      onPointerMove(e: PointerEvent) {
        const o = origin.current
        if (!o) return
        const dx = e.clientX - o.x
        const dy = e.clientY - o.y
        if (Math.abs(dy) < threshold || Math.abs(dy) < Math.abs(dx)) return
        origin.current = undefined
        swiped.current = true
        if (dy > 0) cb.current.onSwipeDown?.()
        else cb.current.onSwipeUp?.()
      },
      onPointerUp() {
        origin.current = undefined
      },
      onPointerCancel() {
        origin.current = undefined
      },
      onClickCapture(e: { preventDefault(): void; stopPropagation(): void }) {
        if (!swiped.current) return
        swiped.current = false
        e.preventDefault()
        e.stopPropagation()
      },
    }),
    [threshold],
  )
}

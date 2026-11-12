import { useCallback, useEffect, useMemo, useRef, type MouseEvent, type PointerEvent } from 'react'

export const LONG_PRESS_MS = 500
/** Finger / pointer travel (px) that turns a press into a scroll or drag. */
export const LONG_PRESS_TOLERANCE = 10

/**
 * Long-press on an element with pointer events (touch, pen, mouse). A short tap is untouched
 * (its `click` goes through); a held press fires `onLongPress` once after `delay` ms and swallows
 * the click that follows the release. The press is cancelled by moving beyond `tolerance`, by
 * release, `pointercancel` (the browser starts scrolling) and by any scroll. Spread the result
 * onto the element; it also suppresses the context menu.
 */
export function useLongPress(
  onLongPress: () => void,
  { delay = LONG_PRESS_MS, tolerance = LONG_PRESS_TOLERANCE } = {},
) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const unfire = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const origin = useRef<{ x: number; y: number } | undefined>(undefined)
  const fired = useRef(false)
  const onScroll = useRef<(() => void) | undefined>(undefined)
  const callback = useRef(onLongPress)
  useEffect(() => {
    callback.current = onLongPress
  })

  const cancel = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
    origin.current = undefined
    if (onScroll.current) window.removeEventListener('scroll', onScroll.current, true)
    onScroll.current = undefined
  }, [])

  useEffect(
    () => () => {
      cancel()
      clearTimeout(unfire.current)
    },
    [cancel],
  )

  return useMemo(() => {
    const release = () => {
      cancel()
      // The click of this very release comes right after; afterwards the flag must not linger.
      if (fired.current) {
        clearTimeout(unfire.current)
        unfire.current = setTimeout(() => (fired.current = false), 350)
      }
    }
    return {
      onPointerDown(e: PointerEvent) {
        if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
        cancel()
        clearTimeout(unfire.current)
        fired.current = false
        origin.current = { x: e.clientX, y: e.clientY }
        onScroll.current = () => cancel()
        window.addEventListener('scroll', onScroll.current, true)
        timer.current = setTimeout(() => {
          cancel()
          fired.current = true
          navigator.vibrate?.(10)
          callback.current()
        }, delay)
      },
      onPointerMove(e: PointerEvent) {
        const o = origin.current
        if (!o || timer.current === undefined) return
        if (Math.hypot(e.clientX - o.x, e.clientY - o.y) > tolerance) cancel()
      },
      onPointerUp: release,
      onPointerCancel: release,
      onPointerLeave: release,
      onClickCapture(e: MouseEvent) {
        if (!fired.current) return
        fired.current = false
        e.preventDefault()
        e.stopPropagation()
      },
      onContextMenu(e: MouseEvent) {
        e.preventDefault()
      },
    }
  }, [cancel, delay, tolerance])
}

import { useEffect, useRef } from 'react'
import { acquireOverlay, nextOverlayId, releaseOverlay, updateOverlay } from './overlayStack'

/** Ties a mounted overlay to the history stack: back closes it via `onClose`. */
export function useOverlayHistory(onClose: () => void): void {
  const id = useRef(0)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
    if (id.current) updateOverlay(id.current, () => close.current())
  })
  useEffect(() => {
    id.current ||= nextOverlayId()
    const mine = id.current
    acquireOverlay(mine, () => close.current())
    return () => releaseOverlay(mine)
  }, [])
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MoveResult } from '../../engine/types'
import { track, type AnalyticsEvent } from '../../analytics'
import { copyToClipboard, shareMessage } from '../../share/actions'
import { useT } from '../../state/hooks'
import { prepareShare, type MoveRef, type ShareContent } from '../../state/share'
import { Dialog } from '../../ui/Dialog'
import { useDesktopPointer } from '../../ui/useDesktopPointer'
import { useOverlayHistory } from '../../ui/useOverlay'
import { showToast } from '../../ui/Toast'

interface Props {
  row: MoveResult
  move: MoveRef
  /** Localized move name and defender name for the title. */
  moveName: string
  defenderName: string
  onClose: () => void
  /** Rectangle of the result row: on desktop the actions open as a popover next to it. */
  anchor?: DOMRect
}

/** Action sheet of one result row: share (system sheet / clipboard), copy text, copy link. */
export function ShareSheet({ row, move, moveName, defenderName, onClose, anchor }: Props) {
  const t = useT()
  const desktop = useDesktopPointer()
  const [content, setContent] = useState<ShareContent>()
  useEffect(() => {
    let stale = false
    // Built up front, so the share call itself runs synchronously inside the tap (Safari only
    // accepts navigator.share() close to the user gesture).
    void prepareShare(row, move).then((c) => {
      if (!stale) setContent(c)
    })
    return () => {
      stale = true
    }
  }, [row, move])

  const done = (ok: boolean) => showToast(t(ok ? 'share.copied' : 'share.copyFailed'))
  const share = () => {
    if (!content) return
    const pending = shareMessage(content)
    onClose()
    void pending.then((outcome) => {
      if (outcome === 'shared') track('share/native')
      else if (outcome === 'copied') {
        track('share/copy-text') // no Web Share: the whole message was copied instead
        done(true)
      } else if (outcome === 'failed') done(false)
    })
  }
  const copy = (text: string | undefined, event: AnalyticsEvent) => {
    if (text === undefined) return
    const pending = copyToClipboard(text)
    onClose()
    void pending.then((ok) => {
      if (ok) track(event)
      done(ok)
    })
  }

  const title = t('share.title', { move: moveName, defender: defenderName })
  const actions = (
    <div className="share-actions" role="group" aria-label={t('share.actions')}>
      <button type="button" className="btn" disabled={!content} onClick={share}>
        <span aria-hidden="true">📤</span> {t('share.share')}
      </button>
      <button
        type="button"
        className="btn"
        disabled={!content}
        onClick={() => copy(content?.full, 'share/copy-text')}
      >
        <span aria-hidden="true">📋</span> {t('share.copyText')}
      </button>
      <button
        type="button"
        className="btn"
        disabled={!content}
        onClick={() => copy(content?.url, 'share/copy-link')}
      >
        <span aria-hidden="true">🔗</span> {t('share.copyLink')}
      </button>
      {!content && (
        <p className="muted" role="status">
          {t('share.preparing')}
        </p>
      )}
    </div>
  )
  return desktop && anchor ? (
    <SharePopover title={title} anchor={anchor} onClose={onClose}>
      {actions}
    </SharePopover>
  ) : (
    <Dialog title={title} onClose={onClose} closeLabel={t('common.close')}>
      {actions}
    </Dialog>
  )
}

const POPOVER_W = 260
const GAP = 4
const MARGIN = 8

/**
 * Desktop variant of the action sheet: a small non-modal popover next to the row. Escape, an
 * outside click, scrolling or leaving it with Tab closes it; it still owns a history entry so the
 * back button behaves like for every other overlay.
 */
function SharePopover({
  title,
  anchor,
  onClose,
  children,
}: {
  title: string
  anchor: DOMRect
  onClose: () => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>()
  useOverlayHistory(onClose)

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0
    const left = Math.max(
      MARGIN,
      Math.min(anchor.right - POPOVER_W - MARGIN, window.innerWidth - POPOVER_W - MARGIN),
    )
    let top = anchor.bottom + GAP
    if (top + h > window.innerHeight - MARGIN) top = Math.max(MARGIN, anchor.top - GAP - h)
    setPos({ left, top })
  }, [anchor])

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    ref.current
      ?.querySelector<HTMLElement>('button:not([disabled])')
      ?.focus({ preventScroll: true })
    ref.current?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', key, true)
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('pointerdown', down, true)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
      opener?.focus?.({ preventScroll: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registered once; onClose is stable enough per open
  }, [])

  return createPortal(
    <div
      ref={ref}
      className="share-popover"
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width: POPOVER_W }}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null
        if (next && !e.currentTarget.contains(next)) onClose()
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useOverlayHistory } from './useOverlay'
import './ui.css'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/** Number of mounted dialogs; the body scroll lock is on while it is above zero. */
let openDialogs = 0

interface DialogProps {
  title: string
  onClose: () => void
  closeLabel: string
  children: ReactNode
  /** `sheet`: bottom sheet; `full`: full-screen overlay. */
  variant?: 'sheet' | 'full'
  /** Extra header content (e.g. the search input of a full-screen search). */
  header?: ReactNode
  /** Focus the first focusable child instead of the dialog (full-screen searches). */
  autoFocusFirst?: boolean
}

/**
 * Accessible modal: role=dialog, labelled by its title, Escape closes, Tab is trapped, body scroll
 * is locked and focus returns to the opener. Nested dialogs work because the topmost one handles
 * (and stops) the key event.
 */
export function Dialog({
  title,
  onClose,
  closeLabel,
  children,
  variant = 'sheet',
  header,
  autoFocusFirst,
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useOverlayHistory(onClose)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const root = ref.current
    if (root) {
      const first = autoFocusFirst ? root.querySelector<HTMLElement>('input') : null
      ;(first ?? root).focus({ preventScroll: true })
    }
    // StrictMode (mount -> cleanup -> mount) stays balanced: every increment has its decrement.
    if (++openDialogs === 1) document.body.classList.add('scroll-lock')
    return () => {
      openDialogs = Math.max(0, openDialogs - 1)
      if (openDialogs === 0) document.body.classList.remove('scroll-lock')
      opener?.focus?.({ preventScroll: true })
    }
  }, [autoFocusFirst])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !ref.current) return
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    )
    if (!items.length) return
    const first = items[0]!
    const last = items[items.length - 1]!
    if (
      e.shiftKey &&
      (document.activeElement === first || document.activeElement === ref.current)
    ) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className={`dialog dialog--${variant}`} onKeyDown={onKeyDown}>
      <div className="dialog__backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className="dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="dialog__header">
          <h2 id={titleId} className="dialog__title">
            {title}
          </h2>
          <button type="button" className="btn btn--icon" onClick={onClose} aria-label={closeLabel}>
            ✕
          </button>
        </header>
        {header}
        <div className="dialog__body">{children}</div>
      </div>
    </div>
  )
}

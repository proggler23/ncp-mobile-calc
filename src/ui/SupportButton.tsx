import type { MouseEventHandler, ReactNode } from 'react'
import { SUPPORT_URL } from '../config'

/**
 * External "Buy me a coffee" link in the service's yellow with dark text (see `.btn--support` in
 * ui.css for the contrast notes). Always opens in a new tab and never leaks the opener.
 */
export function SupportButton({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
}) {
  return (
    <a
      className={`btn btn--support ${className}`.trim()}
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
    >
      {children}
    </a>
  )
}

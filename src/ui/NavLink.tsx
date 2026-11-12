import type { MouseEvent, ReactNode } from 'react'
import { navigate } from '../state/route'

/** In-app link: a real `href` (open in new tab, copy) that navigates through the history router. */
export function NavLink({
  to,
  className,
  children,
}: {
  to: string
  className?: string
  children: ReactNode
}) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return
    e.preventDefault()
    navigate(to)
  }
  return (
    <a className={className} href={`#${to}`} onClick={onClick}>
      {children}
    </a>
  )
}

/** Platform side of sharing: Web Share, clipboard (with a legacy fallback). */

export type ShareOutcome = 'shared' | 'copied' | 'aborted' | 'failed'

/** Copy `text`; the async Clipboard API first, `execCommand` for old / insecure contexts. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* denied: try the legacy path */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

/**
 * Open the system share sheet with lines 1-2 as text and the link as url. Without Web Share (most
 * desktops) the whole message including the link is copied instead. Dismissing the share sheet
 * (AbortError) does nothing.
 */
export async function shareMessage(msg: {
  title: string
  text: string
  url: string
  full: string
}): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    const data = { title: msg.title, text: msg.text, url: msg.url }
    try {
      if (!navigator.canShare || navigator.canShare(data)) {
        await navigator.share(data)
        return 'shared'
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'aborted'
      /* any other failure: fall back to the clipboard */
    }
  }
  return (await copyToClipboard(msg.full)) ? 'copied' : 'failed'
}

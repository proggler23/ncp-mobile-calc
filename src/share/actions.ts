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
 * Open the system share sheet with the whole message (calc line, context line, link as the last
 * line) as `text` only. A separate `url` field is deliberately not sent: on Android, targets such
 * as WhatsApp then drop the text and deliver just the link. Without Web Share (most desktops) the
 * same message is copied instead. Dismissing the share sheet (AbortError) does nothing.
 */
export async function shareMessage(msg: { full: string }): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    const data = { text: msg.full }
    try {
      if (!navigator.canShare || navigator.canShare(data)) {
        await navigator.share(data)
        return 'shared'
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'aborted'
      /* any other failure (e.g. NotAllowedError): fall back to the clipboard */
    }
  }
  return (await copyToClipboard(msg.full)) ? 'copied' : 'failed'
}

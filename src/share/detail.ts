/**
 * Warning details come from attacker-controlled links and are shown to the user, so only a
 * conservative character set survives; anything else is replaced by "?" (never echoed verbatim).
 */
export function safeDetail(v: unknown): string {
  const t = String(v)
  return /^[A-Za-z0-9 _.-]{0,32}$/.test(t) ? t : '?'
}

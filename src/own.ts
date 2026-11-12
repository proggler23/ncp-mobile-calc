/**
 * Own-property lookup for plain objects keyed by untrusted strings (persisted sets, backups,
 * pasted text): `table['constructor']` or `table['__proto__']` must not find inherited members.
 */
export function own<T>(table: Readonly<Record<string, T>>, key: string | undefined): T | undefined {
  return key !== undefined && Object.hasOwn(table, key) ? table[key] : undefined
}

import { useCallback } from 'react'
import type { Lang } from '../storage/types'
import { de } from './de'
import { en, type Dict, type Key } from './en'

export type { Dict, Key, Lang }

export const dictionaries: Record<Lang, Dict> = { en, de }

export type TFn = (key: Key, vars?: Record<string, string | number>) => string

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const text = dictionaries[lang][key] ?? en[key] ?? key
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
}

/** `de*` -> German, everything else English. */
export function detectLang(
  nav: { language?: string; languages?: readonly string[] } | undefined = globalThis.navigator,
): Lang {
  const l = nav?.languages?.[0] ?? nav?.language ?? 'en'
  return l.toLowerCase().startsWith('de') ? 'de' : 'en'
}

/** Hook returning `t` bound to a language (pass the store's `lang`). */
export function useTranslate(lang: Lang): TFn {
  return useCallback((key, vars) => translate(lang, key, vars), [lang])
}

/**
 * The usage-statistics events the app can send (single source: the privacy texts in
 * `src/legal/content.ts` document exactly this list, and a test keeps both in sync). Kept free of
 * app imports so the docs script can load it.
 */
export const STATIC_EVENTS = [
  'share/native',
  'share/copy-text',
  'share/copy-link',
  'share-open',
  'share-open-new',
  'install/accepted',
  'install/ios-howto',
  'install/standalone',
] as const

export type StaticEvent = (typeof STATIC_EVENTS)[number]

/** `gen/<generation>/<regulation>`, e.g. `gen/champions/regmc`. */
export const GEN_EVENT_PATTERN = 'gen/<generation>/<regulation>'

/** Every event name as documented (the generation event as its pattern). */
export const ANALYTICS_EVENTS: readonly string[] = [...STATIC_EVENTS, GEN_EVENT_PATTERN]

export type AnalyticsEvent = StaticEvent | `gen/${string}`

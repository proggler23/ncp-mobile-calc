import type { LegalTexts } from './content'

/** In-app routes of the legal pages (`#/impressum`, ...), by the page they show. */
export const LEGAL_ROUTES = {
  imprint: '/impressum',
  privacy: '/datenschutz',
  disclaimer: '/haftungsausschluss',
} as const satisfies Record<keyof LegalTexts, string>

export type LegalPageId = keyof typeof LEGAL_ROUTES

/** The page for a route (`impressum`, as returned by `useRoute`), if it is a legal page. */
export function legalPageForRoute(route: string): LegalPageId | undefined {
  const r = route.replace(/^\/+|\/+$/g, '')
  return (Object.keys(LEGAL_ROUTES) as LegalPageId[]).find((k) => LEGAL_ROUTES[k] === `/${r}`)
}

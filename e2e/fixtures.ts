import { test as base, expect, type BrowserContext } from '@playwright/test'

/** Every e2e build has the fake statistics endpoint (see playwright.config.ts). */
export const GOATCOUNTER_HOST = /^https:\/\/[^/]*goatcounter\.com\//

/**
 * Answers every request to GoatCounter with 204 (tests never hit the network) and records the
 * requested URLs. The app does not send from automated browsers; `force` lifts only that block
 * (window.__NCP_ANALYTICS_FORCE__), never the opt-out, DNT or GPC.
 */
export async function interceptAnalytics(
  context: BrowserContext,
  { force = false }: { force?: boolean } = {},
): Promise<URL[]> {
  const hits: URL[] = []
  await context.route(GOATCOUNTER_HOST, (route) => {
    hits.push(new URL(route.request().url()))
    return route.fulfill({ status: 204 })
  })
  if (force) {
    await context.addInitScript(() => {
      ;(window as unknown as { __NCP_ANALYTICS_FORCE__: boolean }).__NCP_ANALYTICS_FORCE__ = true
    })
  }
  return hits
}

/**
 * Shared test: pretends the app already runs as an installed app (`navigator.standalone`), so the
 * install banner never shifts the layout in unrelated tests. The iPhone project would otherwise
 * show it (iOS user agent). e2e/install.spec.ts uses the plain test to exercise the banner.
 * Requests to GoatCounter are intercepted for every test (`goatCounter` lists them).
 */
export const test = base.extend<{ goatCounter: URL[] }>({
  context: async ({ context }, provide) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    })
    await provide(context)
  },
  goatCounter: [
    async ({ context }, provide) => {
      await provide(await interceptAnalytics(context))
    },
    { auto: true },
  ],
})
export { expect }

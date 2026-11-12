import { test as base, expect } from '@playwright/test'

/**
 * Shared test: pretends the app already runs as an installed app (`navigator.standalone`), so the
 * install banner never shifts the layout in unrelated tests. The iPhone project would otherwise
 * show it (iOS user agent). e2e/install.spec.ts uses the plain test to exercise the banner.
 */
export const test = base.extend({
  context: async ({ context }, provide) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    })
    await provide(context)
  },
})
export { expect }

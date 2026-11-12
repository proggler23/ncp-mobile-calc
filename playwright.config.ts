import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
  projects: [
    { name: 'Pixel 7', use: { ...devices['Pixel 7'] } },
    // iPhone 14 emulation on Chromium (WebKit needs system deps; remove browserName override to use WebKit)
    { name: 'iPhone 14', use: { ...devices['iPhone 14'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    // Every e2e build includes the (fake) statistics endpoint; the shared fixture intercepts it.
    env: { VITE_GOATCOUNTER_URL: 'https://test.goatcounter.com/count' },
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})

import { test, expect, type Page } from '@playwright/test'

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `e2e/screenshots/${project.replace(/\s+/g, '-')}-${name}.png` })

/** Fires a synthetic `beforeinstallprompt` whose prompt() is recorded in window.__prompted. */
async function fireInstallEvent(page: Page, outcome: 'accepted' | 'dismissed' = 'accepted') {
  await page.evaluate((o) => {
    const w = window as unknown as { __prompted: number }
    w.__prompted = 0
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>
      userChoice: Promise<{ outcome: string }>
    }
    e.prompt = async () => void w.__prompted++
    e.userChoice = Promise.resolve({ outcome: o })
    window.dispatchEvent(e)
  }, outcome)
}

async function noOverflow(page: Page) {
  const m = await page.evaluate(() => ({
    scroll: document.scrollingElement?.scrollWidth ?? 0,
    inner: window.innerWidth,
  }))
  expect(m.scroll).toBeLessThanOrEqual(m.inner)
}

test.describe('Chromium install prompt', () => {
  test.use({ userAgent: ANDROID_UA })

  test('banner sits above the top bar; Install calls prompt() and hides it', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 360, height: 700 })
    await page.goto('/')
    const topbar = page.getByRole('banner')
    await expect(topbar).toBeVisible({ timeout: 30_000 })
    const banner = page.getByRole('region', { name: 'Install app' })
    await expect(banner).toHaveCount(0) // not before the browser offers the install
    await fireInstallEvent(page)
    await expect(banner).toBeVisible()
    await expect(banner.getByText('📲 Install as app – works offline')).toBeVisible()
    const bb = (await banner.boundingBox())!
    const tb = (await topbar.boundingBox())!
    expect(bb.y + bb.height).toBeLessThanOrEqual(tb.y + 1)
    expect(bb.height).toBeGreaterThanOrEqual(44)
    await expect(topbar).toBeVisible()
    await noOverflow(page)
    for (const b of await banner.getByRole('button').all())
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await shot(page, 'install-1-banner-android', info.project.name)

    await banner.getByRole('button', { name: 'Install', exact: true }).click()
    await expect(banner).toBeHidden()
    expect(
      await page.evaluate(() => (window as unknown as { __prompted: number }).__prompted),
    ).toBe(1)
  })

  test('close hides it, also after a reload; the menu entry stays', async ({ page }, info) => {
    await page.goto('/')
    await expect(page.getByRole('banner')).toBeVisible({ timeout: 30_000 })
    await fireInstallEvent(page)
    const banner = page.getByRole('region', { name: 'Install app' })
    await banner.getByRole('button', { name: 'Hide install hint' }).click()
    await expect(banner).toBeHidden()
    await page.waitForTimeout(600)
    await page.reload()
    await expect(page.getByRole('banner')).toBeVisible({ timeout: 30_000 })
    await fireInstallEvent(page)
    await page.waitForTimeout(500)
    await expect(banner).toHaveCount(0)

    await page.getByRole('button', { name: /^Menu/ }).click()
    const menu = page.getByRole('dialog', { name: 'Settings' })
    await expect(menu.getByRole('button', { name: '📲 Install app' })).toBeVisible()
    await shot(page, 'install-3-menu', info.project.name)
  })
})

test.describe('iOS install instructions', () => {
  test.use({ userAgent: IOS_UA })

  test('How? opens the instructions sheet; back closes it', async ({ page }, info) => {
    await page.goto('/')
    await expect(page.getByRole('banner')).toBeVisible({ timeout: 30_000 })
    const banner = page.getByRole('region', { name: 'Install app' })
    await expect(banner).toBeVisible()
    await banner.getByRole('button', { name: 'How?' }).click()
    const sheet = page.getByRole('dialog', { name: 'Install as app' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText(/Add to Home Screen/)).toBeVisible()
    await shot(page, 'install-2-ios-instructions', info.project.name)
    await page.goBack()
    await expect(sheet).toBeHidden()
    await expect(banner).toBeVisible()
    await noOverflow(page)
  })
})

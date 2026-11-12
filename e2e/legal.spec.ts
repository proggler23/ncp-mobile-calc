import { type Page } from '@playwright/test'
import { test, expect } from './fixtures'

const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `e2e/screenshots/legal-${project.replace(/\s+/g, '-')}-${name}.png` })

async function noOverflow(page: Page) {
  const m = await page.evaluate(() => ({
    scroll: document.scrollingElement?.scrollWidth ?? 0,
    inner: window.innerWidth,
  }))
  expect(m.scroll).toBeLessThanOrEqual(m.inner)
}

async function openLegal(page: Page, link: string) {
  await page
    .getByRole('button', { name: /^Menu|menu/i })
    .first()
    .click()
  const menu = page.getByRole('dialog', { name: 'Settings' })
  await menu.getByRole('link', { name: link, exact: true }).click()
}

test.use({ viewport: { width: 360, height: 740 } })

test('menu → Legal → Imprint and Privacy render; back returns to the calculator', async ({
  page,
}, info) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /menu/i }).first()).toBeVisible({ timeout: 30_000 })

  await openLegal(page, 'Imprint / Disclosure')
  await expect(page).toHaveURL(/#\/impressum$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Imprint / Disclosure' })).toBeVisible()
  await expect(page.getByText('Alexander Hain, Linz, Österreich')).toBeVisible()
  await expect(page.getByRole('link', { name: 'al.hain@gmx.at' })).toBeVisible()
  await noOverflow(page)
  await shot(page, 'imprint', info.project.name)

  await page.getByRole('button', { name: /Back/ }).click()
  await expect(page).not.toHaveURL(/impressum/)
  await expect(page.getByRole('heading', { name: 'NCP Calc' })).toBeVisible()

  await openLegal(page, 'Privacy policy')
  await expect(page).toHaveURL(/#\/datenschutz$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Privacy policy' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Anonymous usage statistics (GoatCounter)' }),
  ).toBeVisible()
  await noOverflow(page)
  await shot(page, 'privacy', info.project.name)
  await page.goBack()
  await expect(page).not.toHaveURL(/datenschutz/)
})

test('the menu Privacy "Details" link opens the in-app privacy page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /menu/i }).first().click()
  await page.getByRole('link', { name: 'Details' }).click()
  await expect(page).toHaveURL(/#\/datenschutz$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Privacy policy' })).toBeVisible()
})

test('legal pages work offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /menu/i }).first()).toBeVisible({ timeout: 30_000 })
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // Wait until the precache is complete (the controller takes over after the first load).
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 })
    .toBe(true)
  await context.setOffline(true)
  await page.goto('/#/datenschutz')
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'Privacy policy' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByRole('heading', { name: 'Your rights' })).toBeVisible()
})

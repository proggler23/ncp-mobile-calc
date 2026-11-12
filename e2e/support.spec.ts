import { type Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { CHAMPIONS_PASTE } from '../src/test-fixtures'

const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `e2e/screenshots/${project.replace(/\s+/g, '-')}-${name}.png` })

async function noOverflow(page: Page) {
  const m = await page.evaluate(() => ({
    scroll: document.scrollingElement?.scrollWidth ?? 0,
    inner: window.innerWidth,
  }))
  expect(m.scroll).toBeLessThanOrEqual(m.inner)
}

test('first saved team shows the nudge above the footer; Never keeps it away after a reload', async ({
  page,
}, info) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Create team/ }).click({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Import paste' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import Showdown paste' })
  await dialog.getByLabel('Team name').fill('Nudge team')
  await dialog.getByLabel('Showdown paste').fill(CHAMPIONS_PASTE)
  await dialog.getByRole('button', { name: 'Import' }).click()
  await dialog.getByRole('button', { name: 'Open team' }).click()
  await expect(page.getByRole('heading', { name: 'Nudge team' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to calculator' }).first().click()

  const nudge = page.getByRole('region', { name: 'Support the project' })
  await expect(nudge).toBeVisible()
  await expect(nudge.getByText('Glad the calc helps! ☕')).toBeVisible()
  const footer = page.locator('footer.footer')
  const nb = (await nudge.boundingBox())!
  const fb = (await footer.boundingBox())!
  expect(nb.y + nb.height).toBeLessThanOrEqual(fb.y + 1) // docked above the footer, not over it
  await noOverflow(page)
  await shot(page, 'support-1-nudge', info.project.name)

  await nudge.getByRole('button', { name: 'Never' }).click()
  await expect(nudge).toBeHidden()
  await page.waitForTimeout(600)
  await page.reload()
  await expect(page.getByRole('group', { name: 'Team Nudge team' })).toBeVisible({
    timeout: 30_000,
  })
  await page.waitForTimeout(500)
  await expect(page.getByRole('region', { name: 'Support the project' })).toHaveCount(0)
})

test('teams screen shows the support card without horizontal overflow at 360px', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 700 })
  await page.goto('/#/teams')
  const card = page.getByRole('link', { name: /Like this app\? Support development & hosting/ })
  await expect(card).toBeVisible({ timeout: 30_000 })
  await expect(card).toHaveAttribute('href', 'https://buymeacoffee.com/proggler23')
  await expect(card).toHaveAttribute('target', '_blank')
  expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await noOverflow(page)
  await shot(page, 'support-2-teams-card', info.project.name)
})

test('menu: dot until the menu was opened once, highlighted coffee entry on top', async ({
  page,
}, info) => {
  await page.goto('/')
  const unseen = page.getByRole('button', { name: 'Menu (new)' })
  await expect(unseen).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.topbar__dot')).toBeVisible()
  await shot(page, 'support-3-menu-dot', info.project.name)
  await unseen.click()
  const menu = page.getByRole('dialog', { name: 'Settings' })
  const coffee = menu.getByRole('link', { name: '☕ Support this project' })
  await expect(coffee).toBeVisible()
  const cb = (await coffee.boundingBox())!
  const lb = (await menu.getByRole('heading', { name: 'Language' }).boundingBox())!
  expect(cb.y).toBeLessThan(lb.y)
  await shot(page, 'support-4-menu', info.project.name)
  await menu.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(600)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.locator('.topbar__dot')).toHaveCount(0)
})

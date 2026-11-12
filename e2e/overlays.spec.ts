import { test, expect } from '@playwright/test'

test('close a sheet and immediately open another: one history entry, back closes only the sheet', async ({
  page,
}) => {
  await page.goto('/')
  const choose = page.getByRole('button', { name: /Choose my Pokémon/ })
  await expect(choose).toBeVisible({ timeout: 30_000 })
  const url = page.url()
  const start = await page.evaluate(() => history.length)

  await page.getByRole('button', { name: 'Menu' }).click()
  const menu = page.getByRole('dialog', { name: 'Settings' })
  await expect(menu).toBeVisible()
  // no wait between closing the first sheet and opening the second one
  await menu.getByRole('button', { name: 'Close' }).first().click()
  await choose.click()
  const search = page.getByRole('dialog', { name: /Pok/ })
  await expect(search).toBeVisible()

  // let the deferred history.back() of the first sheet settle
  await page.waitForTimeout(500)
  await expect(search).toBeVisible()
  // exactly one overlay entry on top of the page: depth 1
  expect(await page.evaluate(() => history.length)).toBe(start + 1)
  expect(
    await page.evaluate(() => (history.state as { ncpOverlay?: number } | null)?.ncpOverlay),
  ).toBeDefined()

  // back closes the second sheet and stays in the app
  await page.goBack()
  await expect(search).toBeHidden()
  await expect(page.getByRole('heading', { name: 'NCP Calc' })).toBeVisible()
  expect(page.url()).toBe(url)
  expect(
    await page.evaluate(() => (history.state as { ncpOverlay?: number } | null)?.ncpOverlay),
  ).toBeUndefined()

  // and a fresh sheet still works afterwards
  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

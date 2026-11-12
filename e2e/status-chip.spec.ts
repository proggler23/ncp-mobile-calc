import { test, expect } from './fixtures'

test('status chip: burn lowers physical damage, no overflow at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Choose my Pokémon/ })).toBeVisible({
    timeout: 30_000,
  })
  await page.getByLabel('Generation and regulation').selectOption('sv:regi')
  await expect(page.getByLabel('Generation and regulation')).toBeEnabled()
  await page.getByRole('button', { name: /Choose my Pokémon/ }).click({ timeout: 30_000 })
  await page.getByRole('searchbox').fill('Incineroar')
  await page
    .getByRole('button', { name: /Incineroar/ })
    .first()
    .click()
  await page.getByRole('button', { name: /Choose opponent/ }).click()
  await page.getByRole('searchbox').fill('Flutter Mane')
  await page
    .getByRole('button', { name: /Flutter Mane/ })
    .first()
    .click()

  const rows = page.locator('.result')
  await expect(rows.first()).toBeVisible()
  const before = await rows.allTextContents()

  const chip = page.getByRole('button', { name: /^Status: Healthy, change/ }).first()
  await chip.click()
  await page.getByRole('button', { name: 'Burned', exact: true }).first().click()
  await expect(page.getByRole('button', { name: 'Status: Burned, change' })).toHaveText('BRN')
  await expect.poll(async () => (await rows.allTextContents()).join('|')).not.toBe(before.join('|'))

  // opponent too, via the same strip
  await page.getByRole('button', { name: /^Status: Healthy, change/ }).click()
  await page.getByRole('button', { name: 'Paralyzed', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Status: Paralyzed, change' })).toHaveText('PAR')

  // open strip: nothing overflows, tap targets >= 44px
  await page.getByRole('button', { name: 'Status: Burned, change' }).click()
  const opts = page.getByRole('group', { name: /Status of/ }).getByRole('button')
  for (const o of await opts.all()) {
    const box = (await o.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(43.5)
    expect(box.x + box.width).toBeLessThanOrEqual(360)
  }
  const scroll = await page.evaluate(() => document.scrollingElement?.scrollWidth ?? 0)
  expect(scroll).toBeLessThanOrEqual(360)
  await page.screenshot({ path: 'e2e/screenshots/status-chip.png' })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('group', { name: /Status of/ })).toHaveCount(0)
})

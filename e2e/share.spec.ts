import { type Page } from '@playwright/test'
import { test, expect } from './fixtures'

async function pick(page: Page, button: RegExp, query: string, name: RegExp) {
  await page.getByRole('button', { name: button }).click({ timeout: 30_000 })
  await page.getByRole('searchbox').fill(query)
  await page.getByRole('button', { name }).first().click()
}

/** Press and hold the center of an element (pointer down, wait, pointer up). */
async function hold(page: Page, selector: ReturnType<Page['locator']>, ms = 650) {
  const box = (await selector.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

test('long-press a result row, copy the link, open it elsewhere, then undo', async ({
  page,
  browser,
  context,
  baseURL,
}, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL! })
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  await pick(page, /Choose my Pokémon/, 'Incineroar', /Incineroar/)
  await pick(page, /Choose opponent/, 'Garchomp', /Garchomp/)
  await page.getByRole('radio', { name: 'Opp moves' }).click()
  const rows = page.locator('.result')
  await expect(rows.first()).toBeVisible()
  const shared = rows.nth(1)
  const pct = (await shared.locator('.result__pct').textContent())!
  expect(pct).toMatch(/%/)

  // A normal tap still expands the row.
  await shared.getByRole('button').click()
  await expect(shared.locator('.result__detail')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The Share button inside the details opens the same sheet (keyboard accessible).
  const shareBtn = shared.getByRole('button', { name: /^Share .* calc$/ })
  await expect(shareBtn).toBeVisible()
  expect((await shareBtn.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
  await shareBtn.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: /→ Incineroar$/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await shared.getByRole('button').first().click() // collapse again

  // Long press (no context menu, no text selection, no expansion) opens the action sheet.
  await hold(page, shared.locator('.result__btn'))
  const sheet = page.getByRole('dialog', { name: /→ Incineroar$/ })
  await expect(sheet).toBeVisible()
  await expect(shared.locator('.result__detail')).toHaveCount(0)
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
  const actions = sheet.getByRole('group', { name: 'Share actions' }).getByRole('button')
  await expect(actions).toHaveCount(3)
  for (const b of await actions.all()) {
    await expect(b).toBeEnabled()
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
  }
  const overflow = await page.evaluate(() => ({
    scroll: document.scrollingElement?.scrollWidth ?? 0,
    inner: window.innerWidth,
  }))
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.inner)
  await page.screenshot({ path: 'e2e/screenshots/share-sheet.png' })

  await sheet.getByRole('button', { name: /Copy text/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text.split('\n')).toHaveLength(3)
  expect(text).toMatch(/Garchomp .* vs\. .*Incineroar/)
  expect(text.split('\n')[1]).toMatch(/^Reg M-C · Doubles/)

  await hold(page, shared.locator('.result__btn'))
  await page
    .getByRole('dialog', { name: /→ Incineroar$/ })
    .getByRole('button', { name: /Copy link/ })
    .click()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(/#\/c\/v1\.[\w-]+$/)
  expect(link.length).toBeLessThan(600)
  expect(text.split('\n')[2]).toBe(link)

  // The recipient: a fresh browser profile (nothing saved yet).
  const other = await browser.newContext(info.project.use)
  await other.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
  })
  const page2 = await other.newPage()
  await page2.setViewportSize({ width: 360, height: 740 })
  await page2.goto(link)
  await expect(page2.getByText('Shared calc loaded')).toBeVisible({ timeout: 30_000 })
  await expect(page2.getByRole('radio', { name: 'Opp moves' })).toBeChecked()
  const rows2 = page2.locator('.result')
  await expect(rows2.nth(1).locator('.result__pct')).toHaveText(pct)
  await expect(rows2.nth(1).getByRole('button').first()).toHaveAttribute('aria-expanded', 'true')
  expect(page2.url()).toMatch(/#\/$/)
  expect(page2.url()).not.toContain('/c/')
  const o2 = await page2.evaluate(() => ({
    scroll: document.scrollingElement?.scrollWidth ?? 0,
    inner: window.innerWidth,
  }))
  expect(o2.scroll).toBeLessThanOrEqual(o2.inner)
  await page2.screenshot({ path: 'e2e/screenshots/share-loaded.png' })

  // Undo restores the previous matchup, which was the empty default.
  await page2.getByRole('button', { name: /Undo/ }).click()
  await expect(page2.getByText('Shared calc loaded')).toHaveCount(0)
  await expect(page2.getByRole('button', { name: /Choose my Pokémon/ })).toBeVisible()
  await expect(page2.getByRole('button', { name: /Choose opponent/ })).toBeVisible()

  // Opened again and left alone: the shared matchup is the persisted one. After a reload the hash
  // is gone, so the link is not applied a second time and no notice reappears.
  await page2.goto(link)
  await expect(page2.getByText('Shared calc loaded')).toBeVisible()
  await page2.waitForTimeout(800)
  await page2.reload()
  await expect(page2.locator('.result').first()).toBeVisible({ timeout: 30_000 })
  await expect(page2.getByText('Shared calc loaded')).toHaveCount(0)
  await other.close()
})

test('a broken link shows an error and leaves the app usable', async ({ page }) => {
  await page.goto('/#/c/v1.%%%')
  await expect(page.getByRole('alert').filter({ hasText: 'invalid or too long' })).toBeVisible({
    timeout: 30_000,
  })
  expect(page.url()).toMatch(/#\/$/)
  await expect(page.getByRole('button', { name: /Choose my Pokémon/ })).toBeVisible()
})

test('link preview: Open Graph / Twitter tags and a 1200x630 image', async ({ page, request }) => {
  await page.goto('/')
  const meta = (sel: string) => page.locator(`meta[${sel}]`).getAttribute('content')
  expect(await meta('property="og:title"')).toBe('NCP Mobile Calc – VGC Damage Calculator')
  expect(await meta('property="og:description"')).toBe(
    'Mobile VGC Damage Calc · Champions, S/V & alle Gens · offline · Calcs teilen',
  )
  expect(await meta('name="twitter:description"')).toBe(
    'Mobile VGC Damage Calc · Champions, S/V & alle Gens · offline · Calcs teilen',
  )
  expect(await meta('property="og:type"')).toBe('website')
  expect(await meta('property="og:url"')).toMatch(/^https:\/\/.+\/$/)
  expect(await meta('property="og:image"')).toMatch(/^https:\/\/.+\/og-image-v2\.jpg$/)
  expect(await meta('name="twitter:image"')).toMatch(/^https:\/\/.+\/og-image-v2\.jpg$/)
  expect(await meta('property="og:image:type"')).toBe('image/jpeg')
  expect(await meta('name="twitter:card"')).toBe('summary_large_image')
  expect(await meta('name="theme-color"')).toBeTruthy()

  const res = await request.get('/og-image-v2.jpg')
  expect(res.ok()).toBe(true)
  expect(res.headers()['content-type']).toContain('image/jpeg')
  const jpg = await res.body()
  expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8])
  // size from the SOF0/SOF2 marker
  let o = 2
  while (o < jpg.length && !(jpg[o] === 0xff && (jpg[o + 1] === 0xc0 || jpg[o + 1] === 0xc2)))
    o += 2 + jpg.readUInt16BE(o + 2)
  expect([jpg.readUInt16BE(o + 7), jpg.readUInt16BE(o + 5)]).toEqual([1200, 630])
  expect(jpg.length).toBeLessThan(300 * 1024)
})

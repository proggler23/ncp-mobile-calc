import { type Locator, type Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { CHAMPIONS_PASTE } from '../src/test-fixtures'

const cardOf = (page: Page, side: 'Mine' | 'Opp') =>
  page.getByRole('article', { name: new RegExp(`^${side}:`) })

async function setup(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: '+ Team' }).click({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Import paste' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import Showdown paste' })
  await dialog.getByLabel('Team name').fill('Saved')
  await dialog.getByLabel('Showdown paste').fill(CHAMPIONS_PASTE)
  await dialog.getByRole('button', { name: 'Import' }).click()
  await dialog.getByRole('button', { name: 'Open team' }).click()
  await page.getByRole('button', { name: 'Back to calculator' }).first().click()
  await page.getByRole('group', { name: 'Team Saved' }).getByRole('button').first().click()
  await page
    .getByRole('region', { name: 'Support the project' })
    .getByRole('button', { name: 'Never' })
    .click({ timeout: 2000 })
    .catch(() => {})
}

async function pick(page: Page, field: RegExp, dialogName: string, option: RegExp) {
  await page.getByRole('dialog').first().getByRole('button', { name: field }).click()
  const search = page.getByRole('searchbox')
  await search.fill(option.source.replace(/\\/g, ''))
  await page
    .getByRole('dialog', { name: dialogName })
    .getByRole('button', { name: option })
    .first()
    .click()
}

async function noOverflow(page: Page) {
  const m = await page.evaluate(() => ({
    scroll: document.scrollingElement?.scrollWidth ?? 0,
    inner: window.innerWidth,
  }))
  expect(m.scroll).toBeLessThanOrEqual(m.inner)
}

async function changeBuild(page: Page) {
  await pick(page, /^Nature/, 'Nature', /^Jolly/)
  await pick(page, /^Item/, 'Item', /^Rocky Helmet/)
}

async function expectOriginal(mine: Locator) {
  await expect(mine).toContainText('Careful')
  await expect(mine).toContainText('Sitrus Berry')
}

async function saveSet(page: Page) {
  await page.getByRole('button', { name: 'Edit Mine Pokémon' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Save as custom set' }).click()
  await page.getByLabel('Set name').fill('Sitrus Careful')
  await page.getByRole('button', { name: 'Save', exact: true }).last().click()
  await expect(page.getByText('Saved set “Sitrus Careful”.')).toBeVisible()
  await changeBuild(page)
  await page.getByRole('button', { name: 'Done' }).click()
}

test('load a saved set on my side from the row below my card; battle state stays', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await setup(page)
  const mine = cardOf(page, 'Mine')
  await expect(page.getByRole('button', { name: /★ Saved/ })).toHaveCount(0)
  await saveSet(page)
  await expect(mine).toContainText('Jolly')
  await mine.getByRole('button', { name: /^Status:/ }).click()
  await mine.getByRole('button', { name: 'Burned' }).click()

  const saved = page.getByRole('button', { name: '★ Saved (1)' })
  await expect(saved).toBeVisible()
  const box = (await saved.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(43.5)
  const cardBox = (await mine.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height - 60)
  await noOverflow(page)
  await page.screenshot({ path: 'e2e/screenshots/saved-sets-mine.png' })

  await saved.click({ timeout: 4000 })
  const sheet = page.getByRole('dialog', { name: /Saved sets/ })
  await noOverflow(page)
  await sheet.getByRole('button', { name: /^Sitrus Careful:/ }).click()
  await expectOriginal(mine)
  await expect(mine.getByRole('button', { name: 'Status: Burned, change' })).toBeVisible()
  await noOverflow(page)
})

test('load a saved set through the editor "Load set…" button', async ({ page }) => {
  await setup(page)
  const mine = cardOf(page, 'Mine')
  await page.getByRole('button', { name: 'Edit Mine Pokémon' }).click()
  await expect(page.getByRole('button', { name: 'No saved sets' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await saveSet(page)
  await mine.getByRole('button', { name: /^Status:/ }).click()
  await mine.getByRole('button', { name: 'Burned' }).click()
  await page.getByRole('button', { name: 'Edit Mine Pokémon' }).click()
  const editor = page.getByRole('dialog', { name: 'My Pokémon' })
  await editor.getByRole('button', { name: 'Load set…' }).click()
  await page
    .getByRole('dialog', { name: /Saved sets/ })
    .getByRole('button', { name: /^Sitrus Careful:/ })
    .click()
  await expect(editor.getByRole('button', { name: /^Nature/ })).toContainText('Careful')
  await expect(editor.getByRole('button', { name: /^Item/ })).toContainText('Sitrus Berry')
  await page.getByRole('button', { name: 'Done' }).click()
  await expectOriginal(mine)
  await expect(mine.getByRole('button', { name: 'Status: Burned, change' })).toBeVisible()
})

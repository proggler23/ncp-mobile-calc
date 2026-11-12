import { test, expect, type Page } from '@playwright/test'
import { CHAMPIONS_PASTE } from '../src/test-fixtures'

const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `e2e/screenshots/${project.replace(/\s+/g, '-')}-${name}.png` })

async function nothingOverflows(page: Page) {
  const m = await page.evaluate(() => {
    const w = window.innerWidth
    return {
      scroll: document.scrollingElement?.scrollWidth ?? 0,
      inner: w,
      offenders: [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && (r.right > w + 1 || r.left < -1)
        })
        .map((el) => `${el.tagName}.${el.className}`)
        .slice(0, 5),
    }
  })
  expect(m.scroll).toBeLessThanOrEqual(m.inner)
  expect(m.offenders).toEqual([])
}

/** First run (Champions default): Create team -> import paste -> open the team. */
async function createTeamFromPaste(page: Page, name = 'E2E team') {
  await page.goto('/')
  await page.getByRole('link', { name: /Create team/ }).click({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible()
  await page.getByRole('button', { name: 'Import paste' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import Showdown paste' })
  await dialog.getByLabel('Team name').fill(name)
  await dialog.getByLabel('Showdown paste').fill(CHAMPIONS_PASTE)
  await dialog.getByRole('button', { name: 'Import' }).click()
  await expect(dialog.getByText('Imported 6 Pokémon.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Open team' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

test('team from a Champions paste: set active, tap a chip, see results', async ({ page }, info) => {
  const name = info.project.name
  await createTeamFromPaste(page)
  await expect(page.getByRole('listitem').filter({ hasText: 'Incineroar' })).toBeVisible()
  await shot(page, 'teams-1-detail', name)
  // The first team is active automatically.
  await expect(page.getByRole('button', { name: '✓ Active' })).toBeDisabled()

  await page.getByRole('button', { name: 'Back to calculator' }).first().click()
  const chips = page.getByRole('group', { name: 'Team E2E team' })
  await expect(chips.getByRole('button')).toHaveCount(6)
  await chips.getByRole('button', { name: 'Garchomp' }).click()
  await expect(page.getByRole('heading', { name: 'Garchomp' })).toBeVisible()
  await expect(chips.getByRole('button', { name: 'Garchomp' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.getByRole('button', { name: /Choose opponent/ }).click()
  await page.getByRole('searchbox').fill('Incineroar')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Incineroar/ })
    .first()
    .click()
  await expect(page.locator('.result')).toHaveCount(4)
  await expect(page.locator('.result').first()).toBeInViewport()
  await shot(page, 'teams-2-chips-results', name)

  // The matchup survives a reload.
  await page.waitForTimeout(800)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Garchomp' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Incineroar' })).toBeVisible()
  await expect(page.locator('.result')).toHaveCount(4)
})

test('back button closes the open sheet instead of leaving the app', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Choose my Pokémon/ }).click({ timeout: 30_000 })
  await page.getByRole('searchbox').fill('Garchomp')
  await page
    .getByRole('button', { name: /Garchomp/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Garchomp' })).toBeVisible()
  const url = page.url()

  await page.getByRole('button', { name: /Field/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Field' })
  await expect(sheet).toBeVisible()
  await page.goBack()
  await expect(sheet).toBeHidden()
  expect(page.url()).toBe(url)
  await expect(page.getByRole('heading', { name: 'Garchomp' })).toBeVisible()

  // Closing with the button must not leave a stale entry behind: one back press still stays put.
  await page.getByRole('button', { name: /Field/ }).click()
  await page.getByRole('dialog', { name: 'Field' }).getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toBeHidden()
  await page.getByRole('button', { name: /^✎ Mine/ }).click()
  const editor = page.getByRole('dialog', { name: 'My Pokémon' })
  await expect(editor).toBeVisible()
  // nested: the move search sits on top of the editor sheet
  await editor
    .getByRole('button', { name: /Add move|Move 1/ })
    .first()
    .click()
  await expect(page.getByRole('searchbox')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('searchbox')).toBeHidden()
  await expect(editor).toBeVisible()
  await page.goBack()
  await expect(editor).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Garchomp' })).toBeVisible()
  expect(page.url()).toBe(url)
})

test('back leaves the teams screen for the calculator', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Create team/ }).click({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible()
  await page.getByRole('button', { name: /New team/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Create team' })
  await expect(dialog).toBeVisible()
  await page.goBack() // closes the dialog first
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible()
  await page.goBack() // then leaves the screen
  await expect(page.getByRole('button', { name: /Choose my Pokémon/ })).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible()
})

test('teams screen has no horizontal overflow at 360px', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 700 })
  await createTeamFromPaste(page, 'A fairly long team name to test wrapping behaviour')
  await nothingOverflows(page)
  await shot(page, 'teams-3-detail-360', info.project.name)
  await page.getByRole('button', { name: 'Edit Incineroar' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit Pokémon' })).toBeVisible()
  await nothingOverflows(page)
  await shot(page, 'teams-4-member-editor-360', info.project.name)
  await page.goBack()
  await page.getByRole('button', { name: /← Teams/ }).click()
  await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible()
  await nothingOverflows(page)
  await shot(page, 'teams-5-list-360', info.project.name)
  // the main screen with the team switcher and six chips stays inside the viewport too
  await page.getByRole('button', { name: /Back to calculator/ }).click()
  await expect(page.getByRole('group', { name: /Team A fairly/ })).toBeVisible()
  await nothingOverflows(page)
  await shot(page, 'teams-6-main-360', info.project.name)
  // tap targets on the teams screen
  await page.getByRole('link', { name: 'Manage teams' }).click()
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, select, a.btn')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 40)
      .map(({ el }) => `${el.tagName} ${el.textContent?.slice(0, 20)}`),
  )
  expect(small).toEqual([])
})

test('menu: language switch and backup export', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).click({ timeout: 30_000 })
  const menu = page.getByRole('dialog', { name: 'Settings' })
  await expect(menu.getByText(/Version \d/)).toBeVisible()
  const download = page.waitForEvent('download')
  await menu.getByRole('button', { name: 'Export backup' }).click()
  expect((await download).suggestedFilename()).toMatch(/^ncp-calc-backup-.*\.json$/)
  await menu.getByRole('radio', { name: 'Deutsch' }).click()
  await expect(page.getByRole('dialog', { name: 'Einstellungen' })).toBeVisible()
})

test('a generation that was never downloaded reports it when offline', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Choose my Pokémon/ })).toBeVisible({
    timeout: 30_000,
  })
  await page.evaluate(() => navigator.serviceWorker?.ready)
  await context.setOffline(true)
  await page.getByLabel('Generation').selectOption('swsh')
  await expect(page.getByRole('alert').filter({ hasText: /not downloaded yet/ })).toBeVisible()
  // still on the working generation
  await expect(page.getByLabel('Generation')).toHaveValue('champions')
  await context.setOffline(false)
  await page.getByLabel('Generation').selectOption('swsh')
  await expect(page.getByLabel('Generation')).toHaveValue('swsh')
})

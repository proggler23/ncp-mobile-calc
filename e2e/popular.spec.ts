import { type Page } from '@playwright/test'
import { test, expect } from './fixtures'

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
  expect(m.offenders).toEqual([])
  expect(m.scroll).toBeLessThanOrEqual(m.inner)
}

test('Incineroar move picker in Reg M-C: popular section first, Fake Out on top, no overflow at 360px', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Choose my Pokémon/ })).toBeVisible({
    timeout: 30_000,
  })
  await page.setViewportSize({ width: 360, height: 740 })
  await expect(page.getByLabel('Regulation')).toHaveValue('regmc')
  await page.getByRole('button', { name: /Choose opponent/ }).click()
  await page.getByRole('searchbox').fill('Incineroar')
  await page
    .getByRole('button', { name: /Incineroar/ })
    .first()
    .click()
  await page.getByRole('button', { name: /Edit Opp/ }).click()
  const editor = page.getByRole('dialog')
  await editor.getByRole('button', { name: /^Move 1/ }).click()
  const picker = page.getByRole('dialog', { name: 'Move 1' })
  await expect(picker.getByRole('heading', { name: 'Popular in Reg M-C' })).toBeVisible()
  await expect(picker.getByRole('heading', { name: 'All legal moves' })).toBeVisible()
  await expect(picker.getByText(/^Usage: Smogon \(Showdown, 1760\+\), \w{3} 20\d\d$/)).toBeVisible()
  const first = picker.getByRole('list', { name: 'Popular in Reg M-C' }).getByRole('button').first()
  await expect(first).toContainText('Fake Out')
  await expect(first).toContainText(/\d+\.\d %/)
  await nothingOverflows(page)
  await page.screenshot({ path: 'e2e/screenshots/popular-moves.png' })

  // the nature picker is a picker with the same sections
  await page.keyboard.press('Escape')
  await editor.getByRole('button', { name: /^Nature/ }).click()
  await expect(
    page
      .getByRole('dialog', { name: 'Nature' })
      .getByRole('heading', { name: 'Popular in Reg M-C' }),
  ).toBeVisible()
  await nothingOverflows(page)
})

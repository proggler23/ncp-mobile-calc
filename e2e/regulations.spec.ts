import { type Page } from '@playwright/test'
import { test, expect } from './fixtures'

/** No element may poke out of the viewport horizontally (catches clipped overflow too). */
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

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Choose my Pokémon/ })).toBeVisible({
    timeout: 30_000,
  })
}

test('regulation selector: default Reg M-C, species search follows the regulation', async ({
  page,
}) => {
  await ready(page)
  const reg = page.getByLabel('Generation and regulation')
  await expect(reg).toHaveValue('champions:regmc')

  await page.getByRole('button', { name: /Choose my Pokémon/ }).click()
  const search = page.getByRole('searchbox')
  // A Restricted Legendary is banned in every Champions regulation: nothing to pick
  await search.fill('Koraidon')
  await expect(page.getByRole('button', { name: /Koraidon/ })).toHaveCount(0)
  // Reg M-C added Salamence; Reg M-B does not have it
  await search.fill('Salamence')
  await expect(page.getByRole('button', { name: /^Salamence/ }).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await reg.selectOption('champions:regmb')
  await page.getByRole('button', { name: /Choose my Pokémon/ }).click()
  await page.getByRole('searchbox').fill('Salamence')
  await expect(page.getByRole('button', { name: /Salamence/ })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // "No filter" brings everything the engine knows back
  await reg.selectOption('champions:none')
  await page.getByRole('button', { name: /Choose my Pokémon/ }).click()
  await page.getByRole('searchbox').fill('Koraidon')
  await expect(page.getByRole('button', { name: /Koraidon/ }).first()).toBeVisible()
})

test('the item picker only lists legal items', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: /Choose opponent/ }).click()
  await page.getByRole('searchbox').fill('Incineroar')
  await page
    .getByRole('button', { name: /Incineroar/ })
    .first()
    .click()
  await page.getByRole('button', { name: /Edit Opp/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^Item/ }).click()
  const search = page.getByRole('searchbox')
  // Choice Band is not part of Champions (Reg M-C), Rocky Helmet is
  await search.fill('Choice Band')
  await expect(page.getByRole('button', { name: /Choice Band/ })).toHaveCount(0)
  await search.fill('Rocky Helmet')
  await expect(page.getByRole('button', { name: /Rocky Helmet/ }).first()).toBeVisible()
})

test('the regulation choice survives a reload', async ({ page }) => {
  await ready(page)
  await page.getByLabel('Generation and regulation').selectOption('champions:regma')
  await page.reload()
  await expect(page.getByRole('button', { name: /Choose my Pokémon/ })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByLabel('Generation and regulation')).toHaveValue('champions:regma')
})

for (const gen of ['champions', 'sv']) {
  test(`top bar with the combined gen/regulation select has no overflow at 360px (${gen})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 700 })
    await ready(page)
    if (gen === 'sv') {
      await page.getByLabel('Generation and regulation').selectOption('sv:regi')
      await expect(page.getByLabel('Generation and regulation')).toBeEnabled()
      await expect(page.getByLabel('Generation and regulation')).toHaveValue('sv:regi')
    }
    await expect(page.getByLabel('Generation and regulation')).toBeVisible()
    // the combined select is the only place: no separate regulation row
    await expect(page.getByLabel('Regulation', { exact: true })).toHaveCount(0)
    await nothingOverflows(page)
    // title still has room (or is truncated) and the menu stays reachable
    await expect(page.getByRole('button', { name: /^Menu/ })).toBeVisible()
    const box = await page.getByRole('button', { name: /^Menu/ }).boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(360)
  })
}

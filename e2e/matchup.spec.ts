import { test, expect, type Page } from '@playwright/test'

const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `e2e/screenshots/${project.replace(/\s+/g, '-')}-${name}.png` })

async function noHorizontalScroll(page: Page) {
  const m = await page.evaluate(() => ({
    scroll: document.scrollingElement?.scrollWidth ?? 0,
    inner: window.innerWidth,
    scale: window.visualViewport?.scale ?? 1,
  }))
  expect(m.scroll).toBeLessThanOrEqual(m.inner)
  expect(m.scale).toBe(1)
}

/** No element may poke out of the viewport horizontally (catches clipped overflow too). */
async function nothingOverflows(page: Page) {
  const offenders = await page.evaluate(() => {
    const w = window.innerWidth
    return [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && (r.right > w + 1 || r.left < -1)
      })
      .map(
        (el) =>
          `${el.tagName}.${el.className} ${el.parentElement?.className} ${Math.round(el.getBoundingClientRect().right)}/${w} ${el.closest('section')?.getAttribute('aria-labelledby')}`,
      )
      .slice(0, 5)
  })
  if (offenders.length) await page.screenshot({ path: 'e2e/screenshots/overflow-debug.png' })
  expect(offenders).toEqual([])
}

for (const width of [360, 0]) {
  test(`one-handed flow: Flutter Mane vs Incineroar (Def, Sun)${width ? ` @${width}px` : ''}`, async ({
    page,
  }, info) => {
    if (width) await page.setViewportSize({ width, height: 700 })
    const name = info.project.name
    await page.goto('/')
    await page.getByRole('button', { name: /Choose my Pokémon/ }).click({ timeout: 30_000 })

    // species search: autofocused, no iOS zoom (>= 16px)
    const search = page.getByRole('searchbox')
    await expect(search).toBeFocused()
    expect(
      await search.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16)
    await search.fill('Flutter Mane')
    await shot(page, `${width || 'native'}-1-search`, name)
    await page
      .getByRole('button', { name: /Flutter Mane/ })
      .first()
      .click()
    await expect(page.getByRole('heading', { name: 'Flutter Mane' })).toBeVisible()

    // opponent through the German name
    await page.getByRole('button', { name: /Choose opponent/ }).click()
    await page.getByRole('searchbox').fill('Fuegro')
    const row = page.getByRole('button', { name: /Incineroar/ })
    await expect(row).toContainText('Fuegro')
    await row.click()
    await expect(page.getByRole('heading', { name: 'Incineroar' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Common' })).toBeChecked()

    await page.getByRole('radio', { name: 'Def' }).click()
    await expect(page.getByRole('radio', { name: 'Def' })).toBeChecked()

    // field: Sun
    await page.getByRole('button', { name: /Field/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Field' })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('radio', { name: 'Sun', exact: true }).click()
    await noHorizontalScroll(page)
    await nothingOverflows(page)
    await shot(page, `${width || 'native'}-2-field-sheet`, name)
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText(/Field: ☀ Sun · Doubles/)).toBeVisible()

    // four results with percent ranges, all inside the viewport
    const rows = page.locator('.result')
    await expect(rows).toHaveCount(4)
    // Flutter Mane's usage set carries Protect (no damage, shown as a dash): the rest has ranges.
    await expect(rows.filter({ hasText: /\d+(\.\d+)? - \d+(\.\d+)?%/ })).toHaveCount(3)
    await shot(page, `${width || 'native'}-3-results`, name)
    await expect(rows.first()).toBeInViewport()
    await expect(rows.last()).toBeInViewport()
    await noHorizontalScroll(page)
    await nothingOverflows(page)
    await shot(page, `${width || 'native'}-3-results`, name)

    // expand a row, reverse direction
    await rows.first().getByRole('button').click()
    await expect(rows.first().locator('.result__detail')).toBeVisible()
    await shot(page, `${width || 'native'}-4-expanded`, name)
    await page.getByRole('radio', { name: 'Opp moves' }).click()
    await expect(page.locator('.result')).not.toHaveCount(0)
    await noHorizontalScroll(page)

    // editor sheet
    await page.getByRole('button', { name: /^✎ Mine/ }).click()
    const editor = page.getByRole('dialog', { name: 'My Pokémon' })
    await expect(editor).toBeVisible()
    await editor
      .getByRole('button', { name: /Add move|Move 1/ })
      .first()
      .scrollIntoViewIfNeeded()
    await noHorizontalScroll(page)
    await nothingOverflows(page)
    await shot(page, `${width || 'native'}-5-editor`, name)
    await page.keyboard.press('Escape')
    await expect(editor).toBeHidden()

    // tap targets: every visible button/radio/select is at least 44px high
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button, [role="radio"], select, summary')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 40)
        .map(({ el }) => `${el.tagName} ${el.textContent?.slice(0, 20)}`),
    )
    expect(small).toEqual([])
  })
}

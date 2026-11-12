import { type Locator, type Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { CHAMPIONS_PASTE } from '../src/test-fixtures'

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png` })
const slug = (s: string) => s.replace(/\s+/g, '-')
const genSelect = (page: Page, label = 'Generation and regulation') => page.getByLabel(label)

/** First run (Champions): team from a paste, first chip as my Pokémon, Incineroar as opponent. */
async function setup(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: '+ Team' }).click({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Import paste' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import Showdown paste' })
  await dialog.getByLabel('Team name').fill('Layout')
  await dialog.getByLabel('Showdown paste').fill(CHAMPIONS_PASTE)
  await dialog.getByRole('button', { name: 'Import' }).click()
  await dialog.getByRole('button', { name: 'Open team' }).click()
  await page.getByRole('button', { name: 'Back to calculator' }).first().click()
  await page.getByRole('group', { name: 'Team Layout' }).getByRole('button').first().click()
  await page.getByRole('button', { name: /Choose opponent/ }).click()
  await page.getByRole('searchbox').fill('Incineroar')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Incineroar/ })
    .first()
    .click()
  await expect(page.locator('.result')).toHaveCount(4)
  // The first saved team triggers the support hint; it is covered by its own tests.
  await page
    .getByRole('region', { name: 'Support the project' })
    .getByRole('button', { name: 'Never' })
    .click({ timeout: 2000 })
    .catch(() => {})
}

async function noOverflow(page: Page) {
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

async function heights(page: Page) {
  return page.evaluate(() => {
    const el = (s: string) => document.querySelector<HTMLElement>(s)
    const top = el('.matchup__top')!
    const body = el('.results__body')!
    return {
      topScroll: top.scrollHeight,
      topClient: top.clientHeight,
      resultsScroll: body.scrollHeight,
      resultsClient: body.clientHeight,
      topbar: el('.topbar')!.getBoundingClientRect().height,
      footer: el('.footer')!.getBoundingClientRect().height,
      viewport: window.innerHeight,
    }
  })
}

/** The upper area needs no scrolling (nor does the results list). */
async function noScrolling(page: Page, what: string) {
  await page.waitForTimeout(400) // panel animation
  const h = await heights(page)
  test.info().annotations.push({ type: 'heights', description: `${what}: ${JSON.stringify(h)}` })
  expect(h.topScroll, `upper area ${what}: ${JSON.stringify(h)}`).toBeLessThanOrEqual(
    h.topClient + 1,
  )
  if (h.resultsClient > 0) {
    expect(h.resultsScroll, `results ${what}: ${JSON.stringify(h)}`).toBeLessThanOrEqual(
      h.resultsClient + 1,
    )
  }
}

async function expectTap(loc: Locator, what: string) {
  const box = (await loc.boundingBox())!
  expect(box, what).toBeTruthy()
  expect(box.height, `${what} height`).toBeGreaterThanOrEqual(43.5)
  expect(box.width, `${what} width`).toBeGreaterThanOrEqual(43.5)
}

/** The displayed text of the selected option is not cut off (measured with the select's font). */
async function selectedTextFits(page: Page, values: string[], label?: string) {
  const sel = genSelect(page, label)
  for (const v of values) {
    await sel.selectOption(v)
    const fits = await sel.evaluate((el: HTMLSelectElement) => {
      const cs = getComputedStyle(el)
      const c = document.createElement('canvas').getContext('2d')!
      c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      const text = el.selectedOptions[0]!.textContent!
      const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 22
      return { w: c.measureText(text).width, avail, text }
    })
    expect(fits.w, JSON.stringify(fits)).toBeLessThanOrEqual(fits.avail)
  }
}

const handle = (page: Page) => page.getByRole('button', { name: /^Collapse\/expand results/ })
const cardOf = (page: Page, side: 'Mine' | 'Opp') =>
  page.getByRole('article', { name: `${side}:`, exact: false })

test.describe('everything fits without scrolling the upper area', () => {
  // The device viewports of the task (Pixel 7 screen 412x915, iPhone 14 390x844) and the same
  // minus 90px of browser chrome; plus Playwright's own Pixel 7 viewport (412x839) and its -90.
  for (const [w, h] of [
    [412, 915],
    [412, 825],
    [412, 839],
    [412, 749],
    [390, 844],
    [390, 754],
  ] as const) {
    test(`${w}x${h}`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h })
      await setup(page)
      await noScrolling(page, `${w}x${h}`)
      // chips, both expanded cards, presets and all four result rows are on screen
      await expect(page.getByRole('group', { name: 'Team Layout' })).toBeInViewport({ ratio: 1 })
      for (const side of ['Mine', 'Opp'] as const) {
        await expect(cardOf(page, side)).toBeInViewport({ ratio: 1 })
        await expect(cardOf(page, side).getByRole('progressbar')).toBeVisible()
      }
      await expect(page.getByRole('radiogroup', { name: 'Opponent spread' })).toBeInViewport({
        ratio: 1,
      })
      const rows = page.locator('.result')
      await expect(rows).toHaveCount(4)
      for (let i = 0; i < 4; i++) await expect(rows.nth(i)).toBeInViewport({ ratio: 1 })
      await noOverflow(page)
      await shot(page, `layout-after-${slug(info.project.name)}-${w}x${h}`)
    })
  }

  test('360x740: results collapsed, or both cards collapsed', async ({ page }, info) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await setup(page)
    await noOverflow(page)
    await shot(page, `layout-after-${slug(info.project.name)}-360x740-expanded`)

    await handle(page).click()
    await expect(handle(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.result').first()).toBeHidden()
    await noScrolling(page, '360x740 results collapsed')
    for (const side of ['Mine', 'Opp'] as const) {
      await expect(cardOf(page, side)).toBeInViewport({ ratio: 1 })
    }
    await expect(page.getByRole('radiogroup', { name: 'Opponent spread' })).toBeInViewport({
      ratio: 1,
    })
    await noOverflow(page)
    await shot(page, `layout-after-${slug(info.project.name)}-360x740-results-collapsed`)

    await handle(page).click()
    await expect(page.locator('.result').first()).toBeVisible()
    for (const side of ['Mine', 'Opp'] as const) {
      await cardOf(page, side)
        .getByRole('button', { name: /^Collapse .* card$/ })
        .click()
    }
    await expect(page.locator('.result').last()).toBeInViewport({ ratio: 1 })
    await noScrolling(page, '360x740 cards collapsed')
    await expect(page.getByRole('radiogroup', { name: 'Opponent spread' })).toBeInViewport({
      ratio: 1,
    })
    await noOverflow(page)
    await shot(page, `layout-after-${slug(info.project.name)}-360x740-cards-collapsed`)
  })
})

test('tap targets of the new controls are at least 44px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await setup(page)
  await expectTap(handle(page), 'results handle')
  await expectTap(page.getByRole('button', { name: 'Swap' }), 'swap')
  await expectTap(page.getByRole('button', { name: 'Switch team' }), 'team switcher')
  for (const chip of await page
    .getByRole('group', { name: 'Team Layout' })
    .getByRole('button')
    .all()) {
    const box = (await chip.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(43.5)
    expect(box.width).toBeGreaterThanOrEqual(36) // six chips + switcher share 360px
  }
  for (const side of ['Mine', 'Opp'] as const) {
    await expectTap(
      cardOf(page, side).getByRole('button', { name: /^Collapse .* card$/ }),
      `${side} card toggle`,
    )
    await expectTap(cardOf(page, side).getByRole('button', { name: /^Status:/ }), `${side} status`)
  }
  // the chips row has no horizontal scroll
  const row = await page
    .getByRole('group', { name: 'Team Layout' })
    .evaluate((el) => el.scrollWidth <= el.clientWidth)
  expect(row).toBe(true)
  await noOverflow(page)
})

test('results handle: tap, swipe down/up, and the collapsed state survives a reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await setup(page)
  const h = handle(page)
  await expect(h).toHaveAttribute('aria-expanded', 'true')
  await expect(h).toHaveAttribute('aria-controls', 'results-body')

  await h.click()
  await expect(h).toHaveAttribute('aria-expanded', 'false')
  await expect(h).toContainText(/▲ .+ \d+(\.\d+)?–\d+(\.\d+)?%/)
  await expect(h).toContainText(/\(\+\d\)/)
  await page.waitForTimeout(600)
  await page.reload()
  await expect(handle(page)).toHaveAttribute('aria-expanded', 'false', { timeout: 30_000 })
  await expect(handle(page)).toContainText('▲')
  await expect(page.locator('.result').first()).toBeHidden()

  // a real touch swipe on the handle (CDP touch events -> pointer events)
  const cdp = await page.context().newCDPSession(page)
  const swipe = async (dy: number) => {
    const b = (await handle(page).boundingBox())!
    const x = b.x + b.width / 2
    const y = b.y + b.height / 2
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', yy: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y: yy }],
      })
    await touch('touchStart', y)
    for (const f of [0.25, 0.5, 0.75, 1]) await touch('touchMove', y + dy * f)
    await touch('touchEnd', y)
  }
  await swipe(-60) // up: expand
  await page.waitForTimeout(400)
  await expect(handle(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.result').first()).toBeVisible()
  await swipe(60) // down: collapse
  await page.waitForTimeout(400)
  await expect(handle(page)).toHaveAttribute('aria-expanded', 'false')
  await swipe(20) // below the threshold: nothing
  await expect(handle(page)).toHaveAttribute('aria-expanded', 'false')
})

test('reduced motion: no transition on the results panel', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 360, height: 740 })
  await setup(page)
  const d = await page
    .locator('.results__collapse')
    .evaluate((el) => getComputedStyle(el).transitionDuration)
  expect(d).toBe('0s')
})

test('collapsed results keep the support hint below them and above the footer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  await page.getByRole('link', { name: '+ Team' }).click({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Import paste' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import Showdown paste' })
  await dialog.getByLabel('Showdown paste').fill(CHAMPIONS_PASTE)
  await dialog.getByRole('button', { name: 'Import' }).click()
  await dialog.getByRole('button', { name: 'Open team' }).click()
  await page.getByRole('button', { name: 'Back to calculator' }).first().click()
  const nudge = page.getByRole('region', { name: 'Support the project' })
  await expect(nudge).toBeVisible()
  await handle(page).click()
  await expect(handle(page)).toHaveAttribute('aria-expanded', 'false')
  await page.waitForTimeout(400)
  const results = (await page.locator('section.results').boundingBox())!
  const n = (await nudge.boundingBox())!
  const f = (await page.locator('footer.footer').boundingBox())!
  expect(n.y).toBeGreaterThanOrEqual(results.y + results.height - 1)
  expect(n.y + n.height).toBeLessThanOrEqual(f.y + 1)
  await noOverflow(page)
})

test('a shared link opens the collapsed panel on its row', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await setup(page)
  await handle(page).click()
  await expect(handle(page)).toHaveAttribute('aria-expanded', 'false')
  // long-press is covered in share.spec; here the link itself: copy via the share sheet first
  await handle(page).click()
  await page.waitForTimeout(400) // panel animation
  const row = page.locator('.result').nth(1)
  const box = (await row.locator('.result__btn').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(650)
  await page.mouse.up()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await sheet.getByRole('button', { name: /Copy link/ }).click()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  await page.keyboard.press('Escape')
  await handle(page).click()
  await expect(handle(page)).toHaveAttribute('aria-expanded', 'false')
  await page.evaluate((l) => {
    location.hash = new URL(l).hash
  }, link)
  await expect(handle(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.result__detail')).toBeVisible()
})

test('combined gen/regulation select sets both, keeps one regulation per generation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  const sel = genSelect(page)
  await expect(sel).toHaveValue('champions:regmc', { timeout: 30_000 })
  await expect(page.getByLabel('Regulation', { exact: true })).toHaveCount(0)
  // one top bar row: select, format switch and menu share the height of the bar
  const bar = (await page.locator('header.topbar').boundingBox())!
  expect(bar.height).toBeLessThan(70)

  await sel.selectOption('champions:regmb')
  await expect(sel).toHaveValue('champions:regmb')
  await sel.selectOption('sv:regg')
  await expect(sel).toHaveValue('sv:regg')
  await expect(page.getByRole('radio', { name: '2v2' })).toBeVisible()
  await page.waitForTimeout(600)
  await page.reload()
  await expect(sel).toHaveValue('sv:regg', { timeout: 30_000 })
  await sel.selectOption('gsc')
  await expect(sel).toHaveValue('gsc')
  await sel.selectOption('champions:regmb')
  await expect(sel).toHaveValue('champions:regmb') // its own regulation, not the default

  await selectedTextFits(page, ['champions:none', 'champions:regmc'])
  await noOverflow(page)
  await shot(page, 'layout-topbar-360')
})

test('status chip sits in the name row, the strip opens below it', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await setup(page)
  const mine = cardOf(page, 'Mine')
  const name = (await mine.getByRole('heading').boundingBox())!
  const chip = mine.getByRole('button', { name: /^Status: Healthy/ })
  const c = (await chip.boundingBox())!
  const search = (await mine.getByRole('button', { name: /^Search/ }).boundingBox())!
  expect(Math.abs(c.y + c.height / 2 - (name.y + name.height / 2))).toBeLessThan(6)
  expect(c.x).toBeGreaterThanOrEqual(name.x + 20) // right of the name
  expect(c.x + c.width).toBeLessThanOrEqual(search.x + 1) // before the 🔍
  await chip.click()
  const strip = mine.getByRole('group', { name: /Status of/ })
  const s = (await strip.boundingBox())!
  expect(s.y).toBeGreaterThanOrEqual(c.y + c.height - 1)
  await strip.getByRole('button', { name: 'Burned', exact: true }).click()
  await expect(mine.getByRole('button', { name: 'Status: Burned, change' })).toHaveText('BRN')
  await noOverflow(page)
})

test('the ⚠ icon names the regulation; a tap shows the full text', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  const sel = genSelect(page)
  await expect(sel).toHaveValue('champions:regmc', { timeout: 30_000 })
  await sel.selectOption('champions:none')
  await page.getByRole('button', { name: /Choose my Pokémon/ }).click()
  await page.getByRole('searchbox').fill('Koraidon')
  await page
    .getByRole('button', { name: /Koraidon/ })
    .first()
    .click()
  await sel.selectOption('champions:regmb')
  const icon = cardOf(page, 'Mine').getByRole('button', { name: 'Not legal in Reg M-B' })
  await expectTap(icon, '⚠')
  await expect(cardOf(page, 'Mine').getByRole('note')).toHaveCount(0)
  await icon.click()
  await expect(cardOf(page, 'Mine').getByRole('note')).toContainText(
    /Not legal in Reg M-B: Pokémon/,
  )
  await noOverflow(page)
  await icon.click()
  await expect(cardOf(page, 'Mine').getByRole('note')).toHaveCount(0)
})

test('⇅ swaps the Pokémon and overlaps both cards', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await setup(page)
  const mineName = cardOf(page, 'Mine').getByRole('heading')
  const oppName = cardOf(page, 'Opp').getByRole('heading')
  await expect(mineName).toHaveText('Incineroar')
  await page.getByRole('group', { name: 'Team Layout' }).getByRole('button').nth(1).click()
  await expect(mineName).toHaveText('Garchomp')
  const swap = page.getByRole('button', { name: 'Swap' })
  const s = (await swap.boundingBox())!
  const m = (await cardOf(page, 'Mine').boundingBox())!
  const o = (await cardOf(page, 'Opp').boundingBox())!
  expect(s.y).toBeLessThan(m.y + m.height) // overlaps the bottom edge of the first card
  expect(s.y + s.height).toBeGreaterThan(o.y) // and the top edge of the second
  await swap.click()
  await expect(mineName).toHaveText('Incineroar')
  await expect(oppName).toHaveText('Garchomp')
  await shot(page, 'layout-swap-360')
})

test('cards collapse to one line; presets stay; state survives a reload', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await setup(page)
  const opp = cardOf(page, 'Opp')
  const expanded = (await opp.boundingBox())!.height
  await opp.getByRole('button', { name: 'Collapse Opp card' }).click()
  await expect(opp.getByRole('progressbar')).toHaveCount(0)
  const collapsed = (await opp.boundingBox())!.height
  expect(collapsed).toBeLessThan(expanded - 40)
  expect(collapsed).toBeLessThan(70) // a single line
  await expect(page.getByRole('radiogroup', { name: 'Opponent spread' })).toBeInViewport()
  await expect(opp.getByRole('button', { name: /^Status:/ })).toBeVisible()
  await expect(cardOf(page, 'Mine').getByRole('progressbar')).toBeVisible()
  await noOverflow(page)
  await shot(page, 'layout-card-collapsed-360')

  // 🔍 and ✎ work from the collapsed line, the status chip stays tappable
  await opp.getByRole('button', { name: /^Status:/ }).click()
  await expect(opp.getByRole('group', { name: /Status of/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await opp.getByRole('button', { name: 'Edit Opp Pokémon' }).click()
  await expect(page.getByRole('dialog', { name: 'Opponent' })).toBeVisible()
  await page.keyboard.press('Escape')
  await opp.getByRole('button', { name: 'Search Opp Pokémon' }).click()
  await expect(page.getByRole('searchbox')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.waitForTimeout(600)
  await page.reload()
  const opp2 = cardOf(page, 'Opp')
  await expect(opp2.getByRole('button', { name: 'Expand Opp card' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(cardOf(page, 'Mine').getByRole('progressbar')).toBeVisible()
  // tapping the name expands again
  await opp2.getByRole('button', { name: /^Incineroar/ }).click()
  await expect(opp2.getByRole('progressbar')).toBeVisible()
})

test('team chips: six short chips with full names, "+ Team" without a team', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  await expect(page.getByRole('link', { name: '+ Team' })).toHaveAttribute('href', '#/teams', {
    timeout: 30_000,
  })
  await noOverflow(page)
  await page.getByRole('link', { name: '+ Team' }).click()
  await page.getByRole('button', { name: 'Import paste' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import Showdown paste' })
  await dialog.getByLabel('Showdown paste').fill(CHAMPIONS_PASTE)
  await dialog.getByRole('button', { name: 'Import' }).click()
  await dialog.getByRole('button', { name: 'Open team' }).click()
  await page.getByRole('button', { name: 'Back to calculator' }).first().click()
  const chips = page.getByRole('group', { name: /^Team / }).getByRole('button')
  await expect(chips).toHaveCount(6)
  expect(await chips.evaluateAll((els) => els.map((e) => e.textContent))).toEqual([
    'Inci',
    'Garc',
    'Sini',
    'King',
    'Snea',
    'Whim',
  ])
  await expect(chips.nth(1)).toHaveAttribute('aria-label', 'Garchomp')
  await expect(chips.nth(1)).toHaveAttribute('title', 'Garchomp')
  // the whole row is one line
  const ys = await chips.evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().y)),
  )
  expect(new Set(ys).size).toBe(1)
  await page.getByRole('button', { name: 'Switch team' }).click()
  await expect(page.getByLabel('Active team')).toBeVisible()
  await noOverflow(page)
})

test.describe('German', () => {
  test.use({ locale: 'de-DE' })
  test('top bar: select text fits at 360px, handle and summary are German', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto('/')
    await expect(genSelect(page, 'Generation und Regelwerk')).toHaveValue('champions:regmc', {
      timeout: 30_000,
    })
    await selectedTextFits(
      page,
      ['champions:none', 'sv:none', 'champions:regmc'],
      'Generation und Regelwerk',
    )
    await noOverflow(page)
    await shot(page, 'layout-topbar-360-de')
    await expect(page.getByRole('button', { name: /^Ergebnisse ein-\/ausklappen/ })).toBeVisible()
  })
})

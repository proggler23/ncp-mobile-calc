import { type Locator, type Page } from '@playwright/test'
import { test, expect } from './fixtures'

/**
 * The shared-link notice is position:fixed above the footer on phones. These checks run on the
 * Pixel 7 and iPhone 14 projects (desktop.spec.ts covers the desktop layout).
 */

type Size = { name: string; viewport?: { width: number; height: number } }
const SIZES: Size[] = [
  { name: 'native' },
  { name: '390x754', viewport: { width: 390, height: 754 } },
  { name: '360x740', viewport: { width: 360, height: 740 } },
]

type Box = { x: number; y: number; width: number; height: number }

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function pick(page: Page, button: RegExp, query: string, name: RegExp) {
  await page.getByRole('button', { name: button }).click({ timeout: 30_000 })
  await page.getByRole('searchbox').fill(query)
  await page.getByRole('button', { name }).first().click()
}

/** Press and hold the center of an element (pointer down, wait, pointer up). */
async function hold(page: Page, selector: Locator, ms = 650) {
  const box = (await selector.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

/** Visible, at least 44px tall, inside the viewport, and not covered at its center point. */
async function expectTappable(page: Page, loc: Locator, label: string) {
  await expect(loc, label).toBeVisible()
  const box = (await loc.boundingBox())!
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(44)
  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  expect(box.x, `${label} left`).toBeGreaterThanOrEqual(0)
  expect(box.y, `${label} top`).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, `${label} right`).toBeLessThanOrEqual(vp.w)
  expect(box.y + box.height, `${label} bottom`).toBeLessThanOrEqual(vp.h)
  const covered = await loc.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return !(hit === el || el.contains(hit))
  })
  expect(covered, `${label} is covered by another element`).toBe(false)
}

for (const size of SIZES) {
  test(`shared notice floats above the footer at ${size.name}`, async ({
    page,
    browser,
    context,
    baseURL,
  }, info) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL! })
    if (size.viewport) await page.setViewportSize(size.viewport)
    await page.goto('/')
    await pick(page, /Choose my Pokémon/, 'Incineroar', /Incineroar/)
    await pick(page, /Choose opponent/, 'Garchomp', /Garchomp/)
    await page.getByRole('radio', { name: 'Opp moves' }).click()
    const shared = page.locator('.result').nth(1)
    await expect(shared).toBeVisible()

    await hold(page, shared.locator('.result__btn'))
    await page
      .getByRole('dialog', { name: /→ Incineroar$/ })
      .getByRole('button', { name: /Copy link/ })
      .click()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    expect(link).toMatch(/#c2[\w-]+$/)

    // The recipient: a fresh browser profile, same viewport as the sender.
    const other = await browser.newContext(info.project.use)
    await other.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    })
    const page2 = await other.newPage()
    if (size.viewport) await page2.setViewportSize(size.viewport)
    await page2.goto(link)
    const notice = page2.locator('.share-notice')
    await expect(page2.getByText('Shared calc loaded')).toBeVisible({ timeout: 30_000 })
    await expect(notice).toBeVisible()
    await expect(page2.locator('.result').first()).toBeVisible()

    const footerButtons = page2.locator('.footer__btns button')
    await expect(footerButtons).toHaveCount(3)
    const topbar = page2.locator('.topbar')
    const undo = notice.getByRole('button', { name: /Undo/ })
    const dismiss = notice.getByRole('button', { name: 'Dismiss' })

    const checkFloating = async (phase: string) => {
      const n = (await notice.boundingBox())!
      const vp = await page2.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
      expect(n.x, `${phase}: notice left edge`).toBeGreaterThanOrEqual(0)
      expect(
        n.x + n.width,
        `${phase}: notice right edge (horizontal overflow)`,
      ).toBeLessThanOrEqual(vp.w)
      const scroll = await page2.evaluate(() => document.scrollingElement?.scrollWidth ?? 0)
      expect(scroll, `${phase}: document scrollWidth`).toBeLessThanOrEqual(vp.w)
      expect(n.y + n.height, `${phase}: notice bottom`).toBeLessThanOrEqual(vp.h)
      for (let i = 0; i < 3; i++) {
        const b = (await footerButtons.nth(i).boundingBox())!
        expect(
          overlaps(n, b),
          `${phase}: notice ${JSON.stringify(n)} overlaps footer button ${i} ${JSON.stringify(b)}`,
        ).toBe(false)
      }
      const top = (await topbar.boundingBox())!
      expect(
        overlaps(n, top),
        `${phase}: notice ${JSON.stringify(n)} overlaps top bar ${JSON.stringify(top)}`,
      ).toBe(false)
    }

    // Expanded results panel.
    await checkFloating('expanded')
    await expectTappable(page2, undo, 'Undo')
    await expectTappable(page2, dismiss, 'Dismiss')
    await page2.screenshot({
      path: `e2e/screenshots/notice-mobile-${info.project.name.replace(/\s+/g, '-')}-${size.name}.png`,
    })

    // Results panel collapsed to its handle: the notice must still stay off the footer.
    await page2.locator('.results__handle').click()
    await expect(page2.locator('.results__handle--collapsed')).toHaveCount(1)
    await expect(notice).toBeVisible()
    await checkFloating('collapsed')
    await expectTappable(page2, undo, 'Undo (collapsed)')
    await expectTappable(page2, dismiss, 'Dismiss (collapsed)')
    await page2.screenshot({
      path: `e2e/screenshots/notice-mobile-${info.project.name.replace(/\s+/g, '-')}-${size.name}-collapsed.png`,
    })

    await other.close()
  })
}

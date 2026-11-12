import { type Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { test as plain } from '@playwright/test'

const SIZES = [
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
]

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screenshots/desktop-${name}.png` })

async function pick(page: Page, button: RegExp, query: string, name: RegExp) {
  await page.getByRole('button', { name: button }).click({ timeout: 30_000 })
  await page.getByRole('searchbox').fill(query)
  await page.getByRole('button', { name }).first().click()
}

async function setup(page: Page, size = SIZES[0]!) {
  await page.setViewportSize(size)
  await page.goto('/')
  await pick(page, /Choose my Pokémon/, 'Incineroar', /Incineroar/)
  await pick(page, /Choose opponent/, 'Garchomp', /Garchomp/)
  await expect(page.locator('.result').first()).toBeVisible()
}

for (const size of SIZES) {
  test(`column is ~720px wide and centered at ${size.width}x${size.height}`, async ({ page }) => {
    await setup(page, size)
    const box = (await page.locator('.app').boundingBox())!
    expect(box.width).toBeGreaterThan(700)
    expect(box.width).toBeLessThanOrEqual(722)
    expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThanOrEqual(1)
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const appBg = await page.evaluate(
      () => getComputedStyle(document.querySelector('.app')!).backgroundColor,
    )
    expect(bg).not.toBe(appBg)
    const o = await page.evaluate(() => ({
      s: document.scrollingElement!.scrollWidth,
      w: window.innerWidth,
      sh: document.scrollingElement!.scrollHeight,
      h: window.innerHeight,
    }))
    expect(o.s).toBeLessThanOrEqual(o.w)
    expect(o.sh).toBeLessThanOrEqual(o.h)
    if (size.width === 1280) await shot(page, 'column')
    else await shot(page, `column-${size.width}`)
  })
}

test('right-click on a result row opens a popover next to it with three actions', async ({
  page,
}) => {
  await setup(page)
  const row = page.locator('.result').nth(1)
  await row.click({ button: 'right' })
  const pop = page.getByRole('dialog', { name: /→ Garchomp$/ })
  await expect(pop).toBeVisible()
  await expect(pop).toHaveClass(/share-popover/)
  await expect(pop.getByRole('group', { name: 'Share actions' }).getByRole('button')).toHaveCount(3)
  const r = (await row.boundingBox())!
  const p = (await pop.boundingBox())!
  const gap = p.y >= r.y + r.height ? p.y - (r.y + r.height) : r.y - (p.y + p.height)
  expect(gap).toBeGreaterThanOrEqual(0)
  expect(gap).toBeLessThanOrEqual(40)
  expect(p.x).toBeGreaterThanOrEqual(0)
  expect(p.x + p.width).toBeLessThanOrEqual(1280)
  expect(p.y + p.height).toBeLessThanOrEqual(800)
  await shot(page, 'share-popover')
  await page.keyboard.press('Escape')
  await expect(pop).toHaveCount(0)
  // outside click closes too
  await row.click({ button: 'right' })
  await expect(pop).toBeVisible()
  await page.mouse.click(20, 400)
  await expect(pop).toHaveCount(0)
})

test('hover reveals the share icon; clicking it opens the popover', async ({ page }) => {
  await setup(page)
  const row = page.locator('.result').first()
  const icon = row.getByRole('button', { name: 'Share calc' })
  await expect(icon).toHaveCSS('opacity', '0')
  await row.hover()
  await expect(icon).toHaveCSS('opacity', '1')
  await shot(page, 'row-hover')
  await icon.click()
  await expect(page.getByRole('dialog', { name: /→ Garchomp$/ })).toHaveClass(/share-popover/)
  // the row itself did not expand
  await expect(row.locator('.result__detail')).toHaveCount(0)
})

test('dialogs are centered modals that close on backdrop click and Escape', async ({ page }) => {
  await setup(page)
  const vp = SIZES[0]!
  const openers: [string, () => Promise<void>][] = [
    ['field', () => page.getByRole('button', { name: /Field/ }).click()],
    ['editor', () => page.getByRole('button', { name: '✎ Mine' }).click()],
    ['menu', () => page.getByRole('button', { name: /^Menu/ }).click()],
    ['search', () => page.getByRole('button', { name: 'Search Opp Pokémon' }).click()],
  ]
  for (const [name, open] of openers) {
    await open()
    const dlg = page.getByRole('dialog').last()
    await expect(dlg).toBeVisible()
    const b = (await dlg.boundingBox())!
    expect(b.height).toBeLessThanOrEqual(vp.height * 0.86)
    expect(b.width).toBeLessThanOrEqual(641)
    expect(Math.abs(b.x + b.width / 2 - vp.width / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(b.y + b.height / 2 - vp.height / 2)).toBeLessThanOrEqual(2)
    await shot(page, `dialog-${name}`)
    await page.mouse.click(5, 5) // backdrop
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await open()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
})

test('buttons and chips get hover feedback', async ({ page }) => {
  await setup(page)
  const btn = page.getByRole('button', { name: /Field/ })
  const before = await btn.evaluate((e) => getComputedStyle(e).backgroundColor)
  await btn.hover()
  await expect.poll(() => btn.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(before)
  const menu = page.getByRole('button', { name: /^Menu/ })
  const m0 = await menu.evaluate((e) => getComputedStyle(e).backgroundColor)
  await menu.hover()
  await expect.poll(() => menu.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(m0)
  await expect(menu).toHaveCSS('cursor', 'pointer')
})

test('shared-link notice floats: the opponent card does not move, footer stays reachable', async ({
  page,
  browser,
  context,
  baseURL,
}, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL! })
  await setup(page)
  await page.locator('.result').nth(1).click({ button: 'right' })
  await page.getByRole('button', { name: /Copy link/ }).click()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(/#c2/)

  const other = await browser.newContext(info.project.use)
  await other.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
  })
  const p2 = await other.newPage()
  await p2.setViewportSize({ width: 1280, height: 800 })
  await p2.goto(link)
  const notice = p2.locator('.share-notice')
  await expect(notice).toBeVisible({ timeout: 30_000 })
  await expect(p2.locator('.result').first()).toBeVisible()
  expect(await notice.evaluate((e) => getComputedStyle(e).position)).toBe('fixed')
  const opp = p2.locator('.pair__opp')
  const withNotice = (await opp.boundingBox())!
  const n = (await notice.boundingBox())!
  const footer = (await p2.locator('.footer__btns').boundingBox())!
  expect(n.y + n.height).toBeLessThanOrEqual(footer.y + 1) // does not cover the footer buttons
  await shot(p2, 'shared-notice')
  await p2.getByRole('button', { name: 'Dismiss' }).click()
  await expect(notice).toHaveCount(0)
  const without = (await opp.boundingBox())!
  expect(withNotice).toEqual(without)
  await other.close()
})

plain.describe('desktop install', () => {
  plain(
    'menu entry appears with a captured beforeinstallprompt and calls prompt()',
    async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto('/')
      const menu = page.getByRole('button', { name: /^Menu/ })
      await expect(menu).toBeVisible({ timeout: 30_000 })
      await expect(page.getByRole('region', { name: 'Install app' })).toHaveCount(0)
      await menu.click()
      await expect(page.getByRole('button', { name: '📲 Install app' })).toHaveCount(0)
      await page.keyboard.press('Escape')
      await page.evaluate(() => {
        const w = window as unknown as { __prompted: number }
        w.__prompted = 0
        const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
          prompt: () => Promise<void>
          userChoice: Promise<{ outcome: string }>
        }
        e.prompt = async () => void w.__prompted++
        e.userChoice = Promise.resolve({ outcome: 'accepted' })
        window.dispatchEvent(e)
      })
      await expect(page.getByRole('region', { name: 'Install app' })).toHaveCount(0) // no banner
      await menu.click()
      const entry = page.getByRole('button', { name: '📲 Install app' })
      await expect(entry).toBeVisible()
      await shot(page, 'install-menu')
      await entry.click()
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __prompted: number }).__prompted))
        .toBe(1)
    },
  )
})

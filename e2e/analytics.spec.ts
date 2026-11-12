import { type Page } from '@playwright/test'
import { test as base, expect, interceptAnalytics } from './fixtures'

/** The shared test with sending enabled (the flag only lifts the automated-browser block). */
const test = base.extend<{ hits: URL[] }>({
  hits: async ({ context }, provide) => {
    // Routes of the auto fixture are registered first; this later one answers (and records) here.
    await provide(await interceptAnalytics(context, { force: true }))
  },
})

const BLOCKED = /#|incineroar|garchomp|flare|knock|fake.?out/i

/** `view:/` for page views, `event:<name>` for events. */
const names = (hits: URL[]) =>
  hits.map((u) => `${u.searchParams.get('e') ? 'event' : 'view'}:${u.searchParams.get('p')}`)

function expectClean(hits: URL[]) {
  for (const u of hits) {
    expect(u.origin + u.pathname).toBe('https://test.goatcounter.com/count')
    expect(u.href).not.toMatch(BLOCKED)
    expect([...u.searchParams.keys()].every((k) => ['p', 't', 'r', 'e', 's'].includes(k))).toBe(
      true,
    )
  }
}

async function pick(page: Page, button: RegExp, query: string, name: RegExp) {
  await page.getByRole('button', { name: button }).click({ timeout: 30_000 })
  await page.getByRole('searchbox').fill(query)
  await page.getByRole('button', { name }).first().click()
}

async function openMenu(page: Page) {
  await page.getByRole('button', { name: /^Menu/ }).click({ timeout: 30_000 })
  return page.getByRole('dialog', { name: 'Settings' })
}

test('app start: one page view of "/" and the generation event, nothing else leaks', async ({
  page,
  hits,
}) => {
  await page.goto('/?utm=secret#/')
  await expect.poll(() => names(hits)).toContain('event:gen/champions/regmc')
  await expect.poll(() => names(hits)).toContain('view:/')
  expect(names(hits).filter((n) => n === 'view:/')).toHaveLength(1)
  const view = hits.find((u) => !u.searchParams.get('e'))!
  expect(view.searchParams.get('s')).toMatch(/^\d+,\d+,1$/)
  expect(view.searchParams.has('r')).toBe(false)
  expectClean(hits)

  // A regulation change is a new event; going back to a value sent before is not.
  await page.getByLabel('Generation and regulation').selectOption('champions:regmb')
  await expect.poll(() => names(hits)).toContain('event:gen/champions/regmb')
  await page.getByLabel('Generation and regulation').selectOption('champions:none')
  await expect.poll(() => names(hits)).toContain('event:gen/champions/none')
  await page.getByLabel('Generation and regulation').selectOption('champions:regmb')
  await page.waitForTimeout(500)
  expect(names(hits).filter((n) => n === 'event:gen/champions/regmb')).toHaveLength(1)
  expectClean(hits)
})

test('copy link sends share/copy-link; opening it in a fresh browser: share-open + share-open-new', async ({
  page,
  browser,
  context,
  baseURL,
  hits,
}, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL! })
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  await pick(page, /Choose my Pokémon/, 'Incineroar', /Incineroar/)
  await pick(page, /Choose opponent/, 'Garchomp', /Garchomp/)
  await page.getByRole('radio', { name: 'Opp moves' }).click()
  const row = page.locator('.result').nth(1)
  await expect(row).toBeVisible()
  await row.getByRole('button').click()
  await row.getByRole('button', { name: /^Share .* calc$/ }).click()
  await page
    .getByRole('dialog', { name: /→ Incineroar$/ })
    .getByRole('button', { name: /Copy link/ })
    .click()
  await expect.poll(() => names(hits)).toContain('event:share/copy-link')
  expect(names(hits).filter((n) => n === 'event:share/copy-link')).toHaveLength(1)
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(/#c2/)

  const other = await browser.newContext(info.project.use)
  await other.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
  })
  const hits2 = await interceptAnalytics(other, { force: true })
  const page2 = await other.newPage()
  await page2.goto(link)
  await expect(page2.getByText('Shared calc loaded')).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(() => names(hits2))
    .toEqual(expect.arrayContaining(['event:share-open', 'event:share-open-new']))
  expect(names(hits2).filter((n) => n === 'event:share-open')).toHaveLength(1)
  expect(names(hits2).filter((n) => n === 'event:share-open-new')).toHaveLength(1)
  expect(names(hits2)).toContain('view:/')
  expectClean(hits2)
  expectClean(hits)

  // The same link opened again on this (no longer fresh) browser: share-open only.
  const before = hits2.length
  await page2.goto(link)
  await expect(page2.getByText('Shared calc loaded')).toBeVisible()
  await expect.poll(() => names(hits2).slice(before)).toContain('event:share-open')
  expect(names(hits2).slice(before)).not.toContain('event:share-open-new')
  await other.close()
})

test('first start as an installed app sends install/standalone once per device', async ({
  page,
  hits,
}) => {
  await page.goto('/')
  await expect.poll(() => names(hits)).toContain('event:install/standalone')
  await page.reload()
  await expect.poll(() => names(hits).filter((n) => n === 'view:/').length).toBe(2)
  await page.waitForTimeout(500)
  expect(names(hits).filter((n) => n === 'event:install/standalone')).toHaveLength(1)
})

test('privacy section in the menu; switching it off stops all requests, also after a reload', async ({
  page,
  hits,
}) => {
  await page.goto('/')
  await expect.poll(() => names(hits)).toContain('view:/')
  const menu = await openMenu(page)
  await expect(menu.getByRole('heading', { name: 'Privacy' })).toBeVisible()
  await expect(
    menu.getByText('no cookies, no personal data, no calc content', { exact: false }),
  ).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '#/datenschutz')
  const sw = menu.getByRole('switch', { name: 'Send anonymous statistics' })
  await expect(sw).toBeChecked()
  await sw.uncheck()
  await expect(sw).not.toBeChecked()
  // let the preference reach storage, then change something that would send an event
  await page.waitForTimeout(300)
  const count = hits.length
  await page.keyboard.press('Escape')
  await page.getByLabel('Generation and regulation').selectOption('champions:regma')
  await page.reload()
  await expect(page.getByLabel('Generation and regulation')).toHaveValue('champions:regma')
  await page.waitForTimeout(800)
  expect(hits.length).toBe(count)

  const menu2 = await openMenu(page)
  await expect(menu2.getByRole('switch', { name: 'Send anonymous statistics' })).not.toBeChecked()
  expectClean(hits)
})

test('German privacy text', async ({ page }) => {
  await page.goto('/')
  let menu = await openMenu(page)
  await menu.getByRole('radio', { name: 'Deutsch' }).click()
  menu = page.getByRole('dialog')
  await expect(menu.getByRole('heading', { name: 'Datenschutz' })).toBeVisible()
  await expect(
    menu.getByText('keine Cookies, keine personenbezogenen Daten, keine Calc-Inhalte', {
      exact: false,
    }),
  ).toBeVisible()
  await expect(menu.getByRole('switch', { name: 'Anonyme Statistik senden' })).toBeChecked()
})

base(
  'without the test flag nothing is sent from an automated browser',
  async ({ page, goatCounter }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Choose my Pokémon/ })).toBeVisible({
      timeout: 30_000,
    })
    await page.waitForTimeout(500)
    expect(goatCounter).toHaveLength(0)
  },
)

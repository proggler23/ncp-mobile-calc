import { test, expect } from './fixtures'

const PASTE = `Charizard-Mega-Y @ Charizardite Y
Ability: Blaze
- Heat Wave

Garchomp-Mega-Z @ Garchompite Z
Ability: Rough Skin
- Earthquake

Floette-Mega @ Floettite
Ability: Flower Veil
- Moonblast

Dragonite-Mega @ Dragoninite
Ability: Multiscale
- Extreme Speed

Incineroar @ Sitrus Berry
Ability: Intimidate
- Fake Out

Venusaur-Mega @ Venusaurite
Ability: Overgrow
- Giga Drain
`

test('German chips: Megas get base-name labels with forme badges, no overflow at 360px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).click({ timeout: 30_000 })
  await page
    .getByRole('dialog', { name: 'Settings' })
    .getByRole('radio', { name: 'Deutsch' })
    .click()
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: '+ Team' }).click()
  await page.getByRole('button', { name: 'Paste importieren' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').last().fill(PASTE)
  await dialog
    .getByRole('button', { name: /^Import/ })
    .last()
    .click()
  await dialog.getByRole('button', { name: /Team öffnen/ }).click()
  await page
    .getByRole('button', { name: /Zurück zum Rechner/ })
    .first()
    .click()

  const chips = page.locator('.chips-row__members .chip')
  await expect(chips).toHaveCount(6)
  const texts = await chips.evaluateAll((els) =>
    els.map((e) => ({
      label: Array.from(e.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join(''),
      badge: e.querySelector('.chip__forme')?.textContent ?? '',
      aria: e.getAttribute('aria-label'),
    })),
  )
  expect(texts.map((x) => x.label + '|' + x.badge)).toEqual([
    'Glur|MY',
    'Knak|MZ',
    'Floe|M',
    'Drag|M',
    'Fueg|',
    'Bisa|M',
  ])
  expect(texts[0]!.aria).toContain('Mega-Glurak Y')
  expect(new Set(texts.map((x) => x.label + x.badge)).size).toBe(6)

  const boxes = await chips.evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect()
      const b = e.querySelector('.chip__forme')?.getBoundingClientRect()
      return {
        h: r.height,
        // the chip is round: the badge's outer corner must lie inside the ellipse, not be clipped
        badgeInside:
          !b ||
          ((b.right - (r.left + r.width / 2)) / (r.width / 2)) ** 2 +
            ((b.bottom - (r.top + r.height / 2)) / (r.height / 2)) ** 2 <=
            1,
        textFits: e.scrollWidth <= e.clientWidth,
      }
    }),
  )
  for (const b of boxes) {
    expect(b.h).toBeGreaterThanOrEqual(44)
    expect(b.badgeInside).toBe(true)
    expect(b.textFits).toBe(true)
  }
  await expect(page.locator('.chip__forme').first()).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: 'e2e/screenshots/chips-megas-360.png' })
})

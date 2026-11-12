import { test, expect } from '@playwright/test'

test('renders the app shell', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('NCP Mobile Calc')
  await expect(page.getByRole('heading', { name: 'NCP Calc' })).toBeVisible()
})

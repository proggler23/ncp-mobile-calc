// Generates public/og-image-v2.jpg (1200x630, the link preview of the deployed app): builds the
// app, serves it with `vite preview`, takes a real phone screenshot (German UI, Champions Reg M-C,
// real engine numbers) and composes it into a promo image rendered with Playwright's Chromium.
// Layout note: the content is split left (name, facts) / right (phone). A square center-crop
// (630x630 around x=285..915, used by some WhatsApp clients) keeps the app name and tagline but
// only the left part of the phone; the full 1200x630 shows everything (Discord, Telegram, X).
// Run `npm run og:image`; the image is committed (normal builds never need a browser).
// Bump the file name (og-image-v3 ...) when the picture changes so chat apps drop their cache.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { chromium } from '@playwright/test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'public/og-image-v2.jpg')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

// The matchup on the picture (all legal and popular in Reg M-C).
const MINE = process.env.OG_MINE ?? 'Sneasler'
const OPP = process.env.OG_OPP ?? 'Incineroar'
const PHONE = { width: 390, height: 880 }

const freePort = () =>
  new Promise((res, rej) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address()
      s.close(() => res(port))
    })
    s.on('error', rej)
  })
const port = await freePort()
const base = `http://127.0.0.1:${port}`

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) return
    } catch (e) {
      if (i === 99) console.error(e)
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('preview server did not start')
}

async function appScreenshot(browser) {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'de-DE', // the app picks German from the browser language
    colorScheme: 'light',
  })
  // Pretend to be an installed app: no install banner.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
  })
  const page = await context.newPage()
  await page.goto(base)
  await page.getByRole('button', { name: /Mein Pokémon wählen/ }).waitFor({ timeout: 60_000 })
  await page.getByRole('button', { name: /Mein Pokémon wählen/ }).click()
  await page.getByRole('searchbox').fill(MINE)
  await page
    .getByRole('button', { name: new RegExp(MINE) })
    .first()
    .click()
  await page.getByRole('button', { name: /Gegner wählen/ }).click()
  await page.getByRole('searchbox').fill(OPP)
  await page
    .getByRole('button', { name: new RegExp(OPP) })
    .first()
    .click()
  const common = page.getByRole('radio', { name: 'Häufig' })
  if (!(await common.isChecked())) await common.click()
  await page.locator('.result').first().waitFor()
  await page.addStyleTag({ content: '.topbar__dot { display: none }' }) // unseen-menu marker
  await page.waitForTimeout(800)
  await page.evaluate(() => window.scrollTo(0, 0))
  const png = await page.screenshot({ type: 'png' })
  await context.close()
  return png
}

function compose(shot) {
  const icon = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8')
  const svg = (d) =>
    `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#93c5fd" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
  const facts = [
    [svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'), 'Champions · S/V · Gen 1–9'],
    [
      svg(
        '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1" fill="#93c5fd"/>',
      ),
      'Offline',
    ],
    [
      svg(
        '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
      ),
      'Share',
    ],
  ]
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1200px; height: 630px; overflow: hidden; position: relative; color: #fff;
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    background: linear-gradient(135deg, #0b1534 0%, #12275f 55%, #1d4ed8 140%);
  }
  .left { position: absolute; left: 90px; top: 0; bottom: 0; width: 560px;
    display: flex; flex-direction: column; justify-content: center; gap: 26px; }
  .icon { width: 120px; height: 120px; border-radius: 28px; overflow: hidden;
    box-shadow: 0 10px 30px rgba(0,0,0,.4); }
  .icon svg { width: 120px; height: 120px; display: block; }
  h1 { font-size: 76px; line-height: 1; letter-spacing: -2px; white-space: nowrap; }
  .tag { font-size: 38px; color: #bfdbfe; }
  ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 14px; margin-top: 6px; }
  li { display: flex; align-items: center; gap: 16px; font-size: 30px; font-weight: 600; }
  .phone { position: absolute; left: 770px; top: 18px; width: 274px; height: 594px;
    border-radius: 46px; background: #05070f; padding: 10px;
    box-shadow: 0 0 0 2px #3b4a74, 0 24px 60px rgba(0,0,0,.55), 0 0 90px rgba(59,130,246,.35); }
  .screen { width: 254px; height: 574px; border-radius: 36px; overflow: hidden; background: #fff; }
  .screen img { width: 254px; height: 574px; object-fit: cover; object-position: top; display: block; }
</style></head><body>
  <div class="left">
    <div class="icon">${icon}</div>
    <h1>NCP Mobile Calc</h1>
    <p class="tag">VGC Damage Calculator</p>
    <ul>${facts.map(([i, t]) => `<li>${i}<span>${t}</span></li>`).join('')}</ul>
  </div>
  <div class="phone"><div class="screen"><img src="data:image/png;base64,${shot.toString('base64')}"></div></div>
</body></html>`
}

execFileSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit' })
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--port',
    String(port),
    '--strictPort',
    '--host',
    '127.0.0.1',
  ],
  { cwd: root, stdio: 'inherit' },
)
const browser = await chromium.launch()
try {
  await waitForServer()
  const shot = await appScreenshot(browser)
  if (process.env.OG_DEBUG) writeFileSync('/tmp/og-app.png', shot)
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  await page.setContent(compose(shot))
  // JPEG: the gradient would make a PNG ~380 KB, above the 300 KB budget for link previews
  const jpg = await page.screenshot({ type: 'jpeg', quality: 88 })
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, jpg)
} finally {
  await browser.close()
  server.kill()
}
console.log(`${out}: ${statSync(out).size} bytes`)

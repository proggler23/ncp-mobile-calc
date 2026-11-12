// Renders public/og-image.png (1200x630, the link preview of the deployed app) from a static HTML
// composition with Playwright's Chromium. Run `node scripts/generate-og-image.mjs`; the PNG is
// committed (builds never need a browser).
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/og-image.png')

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #fff;
    background: #1d4ed8; /* flat colors keep the PNG small */
    display: flex; flex-direction: column; justify-content: center; padding: 0 84px; gap: 34px;
  }
  .brand { display: flex; align-items: center; gap: 28px; }
  .logo {
    width: 112px; height: 112px; border-radius: 28px; background: #fff; color: #1d4ed8;
    display: grid; place-items: center; font-size: 48px; font-weight: 800;
  }
  h1 { font-size: 84px; line-height: 1; letter-spacing: -2px; }
  .tag { font-size: 38px; line-height: 1.3; opacity: 0.92; max-width: 960px; }
  .row {
    display: grid; grid-template-columns: 1fr auto; align-items: center; row-gap: 6px;
    background: #fff; color: #14161c; border-radius: 22px; border-left: 16px solid #15803d;
    padding: 22px 34px; width: 820px;
  }
  .name { font-size: 46px; font-weight: 800; }
  .pct { font-size: 46px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .ko { grid-column: 1 / -1; font-size: 28px; color: #5b6272; }
</style></head><body>
  <div class="brand"><div class="logo">NCP</div><h1>NCP Mobile Calc</h1></div>
  <p class="tag">Mobile-friendly VGC damage calculator.<br>Champions, S/V and all gens. Works offline.</p>
  <div class="row">
    <span class="name">Moonblast</span><span class="pct">30.1–36.1%</span>
    <span class="ko">guaranteed 3HKO</span>
  </div>
</body></html>`

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  await page.setContent(html)
  const png = await page.screenshot({ type: 'png' })
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, png)
} finally {
  await browser.close()
}
console.log(`${out}: ${statSync(out).size} bytes`)

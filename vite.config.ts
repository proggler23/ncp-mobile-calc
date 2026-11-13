/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { normalizeBase } from './scripts/vite-base.ts'
import { normalizeGoatCounterUrl } from './scripts/goatcounter-url.ts'
import { generateSitemap, injectSiteUrl, normalizeSiteUrl } from './scripts/site-url.ts'

/** The generation whose data ships in the precache (the current VGC format). */
const PRECACHED_GEN = 'champions'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

/** Public URL of the deployed app, used for the absolute Open Graph URLs (index.html). */
const DEFAULT_SITE_URL = 'https://proggler23.github.io/ncp-mobile-calc/'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = normalizeBase(env.VITE_BASE || process.env.VITE_BASE)
  const siteUrl = normalizeSiteUrl(env.VITE_SITE_URL || process.env.VITE_SITE_URL, DEFAULT_SITE_URL)
  // Anonymous usage statistics endpoint (empty = analytics off). Validated here so a typo fails
  // the build; under Vitest the raw env stays readable so tests can stub it.
  const goatCounterUrl = normalizeGoatCounterUrl(
    env.VITE_GOATCOUNTER_URL || process.env.VITE_GOATCOUNTER_URL,
  )
  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      ...(process.env.VITEST
        ? {}
        : { 'import.meta.env.VITE_GOATCOUNTER_URL': JSON.stringify(goatCounterUrl) }),
    },
    build: {
      rolldownOptions: {
        output: {
          // Per-generation data chunks get recognizable names so the service worker can leave
          // them out of the precache (see `workbox` below): gendata-<gen>-<file>, genmap-<gen>.
          chunkFileNames: (chunk) => {
            const id = (chunk.facadeModuleId ?? '').replaceAll('\\', '/')
            const data =
              /\/src\/data\/generated\/([^/]+)\/(dex|learnsets|sets|regulations|popular)\.json/.exec(
                id,
              )
            if (data) return `assets/gendata-${data[1]}-${data[2]}-[hash].js`
            const ids = /\/src\/share\/generated\/ids-([^/]+)\.json/.exec(id)
            if (ids) return `assets/gendata-${ids[1]}-ids-[hash].js`
            const map = /\/src\/bridge\/generated\/([^/]+)\.json/.exec(id)
            if (map) return `assets/genmap-${map[1]}-[hash].js`
            return 'assets/[name]-[hash].js'
          },
        },
      },
    },
    plugins: [
      react(),
      {
        name: 'site-url',
        transformIndexHtml: (html: string) => injectSiteUrl(html, siteUrl),
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: generateSitemap(siteUrl) })
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icons/*.png'],
        manifest: {
          name: 'NCP Mobile Calc',
          short_name: 'NCP Calc',
          description:
            'Free mobile-first VGC damage calculator for Pokémon Champions, Scarlet/Violet and all earlier generations. Unofficial fan tool.',
          theme_color: '#1d4ed8',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          start_url: base,
          scope: base,
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,json}'],
          // Precache: app shell, UI chunks, engine/NCP script chunks and the Champions data (the
          // current format). Every other generation is fetched on first use and then served from
          // the runtime cache below.
          globIgnores: [
            // Only link-preview crawlers fetch the Open Graph image; the app never needs it offline.
            'og-image-v2.jpg',
            `assets/gendata-!(${PRECACHED_GEN})-*`,
            `assets/genmap-!(${PRECACHED_GEN})-*`,
          ],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/\/sitemap\.xml$/],
          runtimeCaching: [
            {
              urlPattern: /\/assets\/gen(data|map)-[^/]+\.js$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gen-data-v1',
                // 11 other generations x 5 chunks, plus room for a few superseded builds.
                expiration: { maxEntries: 160, maxAgeSeconds: 60 * 60 * 24 * 180 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
    test: {
      environment: 'jsdom',
      globals: true,
      // Tests lazy-load the engine and generation data (large JSON/script chunks). On a loaded
      // machine or CI runner that takes far longer than the 5s/10s defaults, which made the full
      // suite fail intermittently with "Test/Hook timed out" and "Unable to find ..." errors.
      testTimeout: 30_000,
      hookTimeout: 60_000,
      setupFiles: ['./src/test-setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    },
  }
})

import { describe, expect, it } from 'vitest'
import { detectPlatform, type PlatformEnv, type PlatformKind } from './platform'

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const SAMSUNG =
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36'
const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IOS_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1'
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const INSTAGRAM = IOS_SAFARI + ' Instagram 330.0.0.0'
const WHATSAPP_ANDROID = ANDROID_CHROME.replace('Mobile Safari', 'Mobile Safari WhatsApp/2.24')
const FB = ANDROID_CHROME + ' [FB_IAB/FB4A;FBAV/450.0]'
const DESKTOP_CHROME =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const env = (over: Partial<PlatformEnv> & { modes?: string[] }): PlatformEnv => ({
  ua: ANDROID_CHROME,
  platform: 'Linux armv81',
  maxTouchPoints: 5,
  matches: (q) => (over.modes ?? []).some((m) => q === `(display-mode: ${m})`),
  ...over,
})

describe('detectPlatform', () => {
  const table: [string, Partial<PlatformEnv> & { modes?: string[] }, PlatformKind][] = [
    ['Android Chrome', {}, 'android'],
    ['Samsung Internet', { ua: SAMSUNG }, 'android'],
    ['iOS Safari', { ua: IOS_SAFARI, platform: 'iPhone' }, 'ios'],
    ['iOS Chrome (CriOS)', { ua: IOS_CHROME, platform: 'iPhone' }, 'ios'],
    ['iPadOS desktop UA', { ua: MAC_UA, platform: 'MacIntel', maxTouchPoints: 5 }, 'ios'],
    ['real Mac (no touch)', { ua: MAC_UA, platform: 'MacIntel', maxTouchPoints: 0 }, 'desktop'],
    ['Instagram in-app', { ua: INSTAGRAM, platform: 'iPhone' }, 'inapp'],
    ['WhatsApp in-app', { ua: WHATSAPP_ANDROID }, 'inapp'],
    ['Facebook in-app', { ua: FB }, 'inapp'],
    [
      'desktop Chrome',
      { ua: DESKTOP_CHROME, platform: 'Linux x86_64', maxTouchPoints: 0 },
      'desktop',
    ],
    ['display-mode standalone', { modes: ['standalone'] }, 'standalone'],
    ['display-mode minimal-ui', { modes: ['minimal-ui'] }, 'standalone'],
    ['display-mode fullscreen', { modes: ['fullscreen'] }, 'standalone'],
    [
      'iOS navigator.standalone',
      { ua: IOS_SAFARI, platform: 'iPhone', navStandalone: true },
      'standalone',
    ],
  ]
  it.each(table)('%s', (_name, over, kind) => {
    expect(detectPlatform(env(over))).toBe(kind)
  })
})

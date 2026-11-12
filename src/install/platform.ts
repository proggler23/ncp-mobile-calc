/**
 * Where is the app running and how can it be installed? Pure functions over an injectable
 * environment so every browser can be tested from a table.
 */
export type PlatformKind = 'standalone' | 'inapp' | 'ios' | 'android' | 'desktop'

export interface PlatformEnv {
  ua: string
  platform: string
  maxTouchPoints: number
  /** `navigator.standalone` (iOS home-screen apps). */
  navStandalone?: boolean
  matches: (query: string) => boolean
}

/** Embedded browsers (no install, no share-sheet "Add to Home Screen"). */
export const IN_APP_UA =
  /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Twitter|TikTok|musical_ly|BytedanceWebview|Snapchat|GSA\/|MicroMessenger|Pinterest|LinkedInApp|Messenger|; wv\)/i

const DISPLAY_MODES = ['standalone', 'fullscreen', 'minimal-ui']

export function isStandalone(env: PlatformEnv): boolean {
  return (
    env.navStandalone === true || DISPLAY_MODES.some((m) => env.matches(`(display-mode: ${m})`))
  )
}

export function isIOS(env: Pick<PlatformEnv, 'ua' | 'platform' | 'maxTouchPoints'>): boolean {
  if (/iPhone|iPad|iPod/.test(env.ua)) return true
  // iPadOS 13+ reports a desktop Mac UA.
  return env.platform === 'MacIntel' && env.maxTouchPoints > 1
}

export function detectPlatform(env: PlatformEnv): PlatformKind {
  if (isStandalone(env)) return 'standalone'
  if (IN_APP_UA.test(env.ua)) return 'inapp'
  if (isIOS(env)) return 'ios'
  if (/Android/i.test(env.ua)) return 'android'
  return 'desktop'
}

export function readEnv(): PlatformEnv {
  return {
    ua: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    navStandalone: (navigator as { standalone?: boolean }).standalone,
    matches: (q) => typeof matchMedia === 'function' && matchMedia(q).matches,
  }
}

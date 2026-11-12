import path from 'node:path'

export const ROOT = path.resolve(import.meta.dirname, '../..')
export const UPSTREAM_REPO = 'https://github.com/nerd-of-now/NCP-VGC-Damage-Calculator'
export const UPSTREAM_BRANCH = 'main'
export const VENDOR_DIR = path.join(ROOT, 'vendor/ncp')
export const UPSTREAM_MD = path.join(VENDOR_DIR, 'UPSTREAM.md')
export const PATCH_DIR = path.join(ROOT, 'vendor/ncp-patches')
export const GOLDEN_DIR = path.join(ROOT, 'src/engine/__golden__')
export const CACHE = path.join(ROOT, '.cache/ncp-sync')

/** Upstream pages whose <script src> lists define what the original calculator loads. */
export const PAGES = ['index.html', 'lgpe-calc.html', 'za-calc.html']

/**
 * Script references we knowingly do NOT vendor (UI-only, set data, libraries, ads, easter eggs).
 * Anything referenced by a page that is neither vendored (listed in UPSTREAM.md) nor matched here
 * is reported as a structural change ("new script"), because it may carry engine logic.
 */
export const IGNORED_REFS: RegExp[] = [
  /^https?:\/\//,
  /^jquery[-.\w]*\.js$/,
  /^script_res\/setdex_[\w.-]+\.js$/,
  /^script_res\/(switch_mode|sidebars|statuscalc|select2\.min)\.js$/,
  /^afd_res\//,
]

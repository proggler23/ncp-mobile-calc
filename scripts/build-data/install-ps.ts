import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { CACHE_DIR } from './fetch'

/**
 * Showdown's data mods for Let's Go (gen7letsgo), Legends Z-A (gen9legends) and Champions are not
 * in @pkmn/dex. They ship in the official `pokemon-showdown` npm package, which we install into
 * the cache dir (never into the project) with lifecycle scripts disabled.
 */
export const PS_VERSION = 'latest'

export async function ensurePokemonShowdown() {
  const dir = path.join(CACHE_DIR, 'ps')
  if (existsSync(path.join(dir, 'node_modules', 'pokemon-showdown', 'package.json'))) return
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'package.json'), '{"name":"ps-cache","private":true}\n')
  execFileSync(
    'npm',
    ['install', `pokemon-showdown@${PS_VERSION}`, '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: dir, stdio: 'inherit' },
  )
}

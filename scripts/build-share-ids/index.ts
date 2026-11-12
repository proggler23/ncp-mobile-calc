/**
 * Build the append-only share-id tables (src/share/generated/ids-<gen>.json) from the committed
 * dex files. Existing numbers never change; new ids are appended.
 *   npm run build:share-ids
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { currentFor, GEN_IDS, OUT, readTable, serialize } from './lib'
import { mergeTable, tableChanges } from './tables'

mkdirSync(OUT, { recursive: true })
for (const gen of GEN_IDS) {
  const prev = readTable(gen)
  const next = mergeTable(prev, currentFor(gen))
  const problems = tableChanges(prev, next)
  if (problems.length) throw new Error(`${gen}: ${problems.join('; ')}`)
  writeFileSync(path.join(OUT, `ids-${gen}.json`), serialize(next))
  const added = prev ? next.species.length - prev.species.length : next.species.length
  console.log(
    `${gen}: ${next.species.length} species, ${next.moves.length} moves, ${next.items.length} items, ${next.abilities.length} abilities (${added} new species)`,
  )
}

/**
 * Evaluates the vendored NCP data scripts under Node (via the engine's sandbox loader, with files
 * read from disk instead of Vite `?raw` imports) and returns the entity name tables per gen.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { FormState } from '../../src/engine/sandbox/jquery-stub'
import { createSandbox } from '../../src/engine/sandbox/loader'

const RES = path.resolve(import.meta.dirname, '../../vendor/ncp/script_res')
const read = (f: string) => readFileSync(path.join(RES, `${f}.js`), 'utf8')

// Same order as src/engine/sources/{data,logic}.ts
const CORE = [
  'pokedex',
  'stat_data',
  'type_data',
  'nature_data',
  'ability_data',
  'item_data',
  'move_data',
  'ap_calc',
  'damage_MASTER',
  'damage_SV',
  'damage_xy',
  'damage_dpp',
  'damage_rse',
  'damage_gsc',
  'damage_rby',
  'ko_chance',
]
const ZA = ['move_data_za', 'cooldown_za']

export interface NcpTable {
  species: string[]
  moves: string[]
  items: string[]
  abilities: string[]
}

export const NCP_GENS: { gen: number; natdex: boolean }[] = [
  { gen: 1, natdex: false },
  { gen: 2, natdex: false },
  { gen: 3, natdex: false },
  { gen: 4, natdex: false },
  { gen: 5, natdex: false },
  { gen: 6, natdex: false },
  { gen: 7, natdex: false },
  { gen: 7.5, natdex: false },
  { gen: 8, natdex: false },
  { gen: 8, natdex: true },
  { gen: 9, natdex: false },
  { gen: 9, natdex: true },
  { gen: 9.5, natdex: false },
  { gen: 10, natdex: false },
  { gen: 10, natdex: true },
]

export function loadNcpTables(): Map<string, NcpTable> {
  const rt = createSandbox(CORE.map(read), new FormState())
  for (const f of ZA) rt.evalScript(read(f))
  const out = new Map<string, NcpTable>()
  for (const { gen, natdex } of NCP_GENS) {
    rt.api.configureGen(gen as never, natdex)
    const d = rt.api.data()
    out.set(`${gen}${natdex ? ':nd' : ''}`, {
      species: Object.keys(d.pokedex),
      moves: Object.keys(d.moves).filter((m) => m !== '(No Move)'),
      items: [...d.items].filter((i) => i !== ''),
      abilities: [...d.abilities].filter((a) => a !== ''),
    })
  }
  return out
}

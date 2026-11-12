# src/bridge

Glue between the UI/storage world (Showdown ids, string gen ids `rby`..`champions`) and the NCP
engine (`src/engine`: NCP display-name keys, numeric gen ids).

```ts
import { prepareBridge, toEngineInput } from './bridge'
import { calculate } from './engine'

await prepareBridge('sv') // name map + Showdown data + engine, once per gen
const result = calculate(toEngineInput('sv', attackerSet, defenderSet, { weather: undefined }))
```

## Name maps (generated)

`npm run build:bridge` (needs `src/data/generated`, so run it after `npm run build:data`; or run
both with `npm run build:assets`) evaluates the vendored NCP data tables through the engine
sandbox (`scripts/build-bridge/ncp-tables.ts`) and matches every NCP entity of each generation
(and of NCP's National Dex tables in gens 8/9/10) to a Showdown record by normalized name, using
`scripts/build-bridge/overrides.ts` for names that differ (`Mega Charizard X`, `Urshifu-Single
Strike`, `Calyrex-Shadow Rider`, `Pumpkaboo-Average`, `As One`, ...). Output:
`generated/<gen>.json` (entries `[id, ncpName, flags, en?, de?]`, see `types.ts`) and
`generated/COVERAGE.md` (per-gen coverage table and the lists of unmatched entities).

- Entities missing from a generation's own Showdown data (National Dex entries, Megas in Z-A, ...)
  are matched against the other generations' data (`FLAG_FOREIGN`, carries en/de names).
- NCP entities with no Showdown record at all (`FLAG_NCP_ONLY`) stay usable: the id is the
  normalized NCP name, the display name is the NCP English name, there is no German name.
- Showdown formes NCP folds into another entry resolve one-way (`FLAG_ALIAS`: `arceusfire`,
  `ogerponwellspringtera`, `pumpkaboo`, `castformrainy`, ...); Gigantamax ids (`charizardgmax`)
  resolve to the base species plus `gmax`/`dynamax`.
- Typed Hidden Power moves use ids `hiddenpowerfire` etc. (the data files give all of them the id
  `hiddenpower`, the bridge disambiguates through the English name).

## natDex decision

`natDex` (gens 8/9/10) is `false` unless the species, a move, the item or the ability of either set
exists only in NCP's National Dex tables; then it is `true`. Override with `opts.natDex`.

## Conveniences replicated from NCP's UI (ap_calc.js), see `auto.ts` / `hidden-power.ts`

Each is on by default and can be disabled via `ToEngineOptions`:
ability weather/terrain (`autoField`, only when `field.weather`/`field.terrain` is `undefined`;
conflicts: primal weather wins, else `abilityPriority`, default defender), Flame/Toxic Orb status
(`autoStatus`), Arceus plates / Z crystals and Silvally memories (`autoTypes`), Hidden Power IVs in
gens 2-6 (`autoHiddenPower`, standard Smogon 30/31 spreads, DVs in gen 2).

## Stat conventions

- Champions: `statPoints` -> engine `statPoints`; `evs`/`ivs`/level are ignored.
- Gens 1-2: `ivs` -> DVs (`floor(iv / 2)`), `evs` ignored (NCP assumes max stat experience); no nature.
- LGPE: `evs` hold Awakening Values (capped at 200) -> `avs`; `ivs` pass through.
- Other gens: `evs`/`ivs` pass through. Level defaults to 50.

## Limitations

- Z-A learnsets are inherited from SV; `movesForSpecies('za', ...)` returns learnset hits first
  and then every Z-A move, with `learnsetReliable: false` (same when a species has no learnset).
- Aliased formes only carry their types (e.g. Mimikyu-Busted is plain Mimikyu); NCP has no
  separate entry for them. Showdown-only moves/items (Bide, Confide, ...) cannot be calculated.
- Moves are matched by name only; Z-/Max-move conversion is requested per move via
  `moveOverrides` (`z: true`), not derived from the item.

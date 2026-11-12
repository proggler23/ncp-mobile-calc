# src/engine

Pure, typed damage engine whose results match the original NCP VGC Damage Calculator exactly.

```ts
import { prepare, calculate, listGens } from './engine'

await prepare(9) // lazily loads the vendored NCP scripts (first call only)
const result = calculate({
  gen: 9,
  attacker: { species: 'Flutter Mane', nature: 'Timid', evs: { sa: 252 }, moves: ['Moonblast'] },
  defender: { species: 'Incineroar', evs: { hp: 252 }, moves: [] },
  field: { weather: 'Rain', defenderSide: { reflect: true } },
})
result.moves[0] // { damage: number[16], description, koChance, damageText, percentRange, ... }
```

Types are in `types.ts` (`CalcInput`, `CalcResult`, ...). All names are NCP's English display names.

## How it works

The unmodified upstream scripts in `vendor/ncp/script_res` (see `vendor/ncp/UPSTREAM.md`) are the
calculation. They are classic scripts that read their inputs from the DOM via jQuery, so:

- `sandbox/loader.ts` concatenates the script texts (imported with Vite `?raw`, in 3 lazy chunks:
  `sources/data.ts`, `sources/logic.ts`, `sources/za.ts`) and evaluates them as the body of one
  sloppy-mode generator function whose parameters are stubbed browser globals (`$`, `localStorage`,
  `document`, `alert`). Works identically under Node/Vitest and in browsers (needs `new Function`,
  i.e. no CSP without `unsafe-eval`). The generator lets later scripts be evaluated in the same scope.
- `sandbox/jquery-stub.ts` is a minimal jQuery that answers the scripts' reads from an in-memory
  `FormState` and ignores UI-only calls (unknown methods are recorded and asserted empty in tests).
- `sandbox/facade-source.ts` is appended inside the same scope: a copy of the `.gen` change
  handler's global assignments plus the few entry points the adapter needs.
- `adapter.ts` fills the `FormState` from a `CalcInput`, reproducing the values the UI derives when
  a user picks a Pokemon/move/ability (types, base stats, move defaults, multi-hit defaults, Hidden
  Power type, Z-A "plus" moves, ...). Stat totals/HP use NCP's own `calcHP`/`calcStats`.
- `calculate()` runs NCP's own `calculate()` (which also produces the KO-chance text) and reads
  `damageResults`.

## Differences from clicking through the original UI

The engine takes the final, explicit state. These UI conveniences are intentionally NOT applied
(the caller/UI supplies the result): auto weather/terrain from abilities (Drought...), Flame/Toxic
Orb -> status, Arceus plate / Silvally memory -> type, Hidden Power IV rewriting for named
`Hidden Power <Type>` moves in gens 2-6, Transform, custom modifiers, sets/sidebars.

## Tests

`engine.golden.test.ts` replays every scenario in `__golden__/*.json` (captured from the real
original pages by `scripts/ncp-golden`) and requires exact equality of damage rolls, description and
KO text. `npm run engine:browser-verify` replays them in headless Chromium against a Vite build.

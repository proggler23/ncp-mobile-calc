# src/data

Generated game data consumed by the app, plus a small typed loader.

- `index.ts` - `loadGenData(gen)` (dex + learnsets, code-split per generation via `import.meta.glob`),
  `loadSets(gen)` (common sets, separate chunk), `canLearn`, re-exports search helpers.
- `normalize.ts` - `normalizeSearch`, `searchSpecies` / `searchMoves` / `searchItems` / `searchAbilities`.
- `types.ts` - `GenId` (`rby gsc adv dpp bw xy sm lgpe swsh sv za champions`) and all record types.
- `generated/<gen>/dex.json | learnsets.json | sets.json` and `generated/sources.json`
  are produced by `npm run build:data` (see `scripts/build-data/README.md`). Do not edit by hand.

Every entity carries the Showdown `id` and the Showdown English display name (`en`) so a later step
can map to NCP names. `de` falls back to `en` when PokeAPI has no German name.

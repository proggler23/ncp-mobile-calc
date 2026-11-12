# scripts/build-data

`npm run build:data` (tsx) writes `src/data/generated/<gen>/{dex,learnsets,sets}.json`,
`generated/sources.json` and `generated/version.json`.

| command                                | effect                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run build:data`                   | rebuild the ACTIVE gens only (`ACTIVE_FORMATS` in `config.ts`, initially `champions`) |
| `npm run build:data -- --refresh`      | same, ignoring the download cache (re-fetch Smogon usage stats)                       |
| `npm run build:data -- --all`          | every gen (manual; the weekly job never does this)                                    |
| `npm run build:data -- --gen sv,za`    | specific gens                                                                         |
| `npm run build:data -- --update-names` | re-download PokeAPI and rewrite `names/de.json` (combine with `--all` as needed)      |
| `npm run build:version`                | rewrite `version.json` only                                                           |

Frozen gens (everything not in `ACTIVE_FORMATS`) are committed snapshots: their files are never
written unless selected with `--all` / `--gen`.

## Pipeline

1. `dex-sources.ts` - entities + learnsets from the official `pokemon-showdown` npm package, pinned
   to an exact version in `package.json` (devDependency; no runtime install). Mainline gens use
   `Dex.forGen(n)` (learnsets restricted to gen n, existence rules as the old `@pkmn/data` layer);
   Let's Go, Z-A and Champions use the `gen7letsgo` / `gen9legends` / `champions` mods.
2. `names.ts` - German names from the COMMITTED snapshot `names/de.json` (built from PokeAPI CSVs,
   keyed by the Showdown id of the English name) plus the hand-maintained `names/overrides.de.json`
   (overrides win). PokeAPI is contacted only with `--update-names`. Entities without a German name
   fall back to English and are listed in the gate report.
3. `sets.ts` - top 3 spreads per species from Smogon `chaos` stats of the VGC formats in `config.ts`.
   Optional: if the download fails or no usable stats exist any more, the last committed `sets.json`
   is kept (recorded as `usageFallback` in `sources.json`). Usage months are visible in
   `version.json` (`usageMonths`).
4. `sets-merge.ts` + `sets/curated.json` - curated sets layered over the generated ones
   (schema documented in the JSON's `$comment` and in docs/MAINTENANCE.md).
5. `version.ts` - `version.json` (`ncpSha`, `ncpSyncedAt`, `showdownVersion`, `usageMonths`,
   `namesSnapshotDate`, `builtAt`), exposed to the app as `getDataVersionInfo()` (`src/data/version.ts`).
   `builtAt` only moves when something else in the file changed.

Downloads (untrusted, only parsed as data) go to the gitignored `.cache/build-data/downloads`;
a detailed report (missing German names, sizes) goes to `.cache/build-data/report.json`.
Typecheck all scripts with `npm run typecheck:scripts`.

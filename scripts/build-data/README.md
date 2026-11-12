# scripts/build-data

`npm run build:data` (tsx) writes `src/data/generated/<gen>/{dex,learnsets,sets}.json` (plus
`regulations.json` / `popular.json` for gens with regulations / Smogon regulation stats),
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
   4b. `popular.ts` - top 10 moves/items/abilities/natures per species for each regulation with a
   `usage` format in `config.ts` -> `popular.json` (see docs/MAINTENANCE.md, "Popular lists"). Same
   downloads/fallbacks as `sets.ts` (`chooseChaos`).
5. `regulations.ts` - legal pools per regulation, see "Regulations" below.
6. `version.ts` - `version.json` (`ncpSha`, `ncpSyncedAt`, `showdownVersion`, `usageMonths`,
   `regulations` (source of each regulation list), `namesSnapshotDate`, `builtAt`), exposed to the app as `getDataVersionInfo()` (`src/data/version.ts`).
   `builtAt` only moves when something else in the file changed.

## Regulations

`GenConfig.regulations` (`config.ts`) lists the regulations of a generation (id, en/de label,
Showdown `format`, one `default`). `regulations.ts` turns each into `regulations.json`:

- **showdown**: `Dex.formats.get(format)` + `new TeamValidator(format)`; every dex entity is run
  through `checkSpecies` / `checkItem` / `checkMove` (isNonstandard, Restricted Legendary / Mythical
  tag bans, banlists), then intersected with the dex built for the gen. Formes and Megas are legal
  as the rules say. `moves` is written only when the regulation allows fewer moves than the dex lists.
- **manual**: `regulations/manual.json` adds a regulation the pinned Showdown does not know or
  overrides one. Schema (see `ManualRegulation` in `regulations.ts`): `base` (another regulation of
  the gen), `species` / `items` / `moves` (full replacement) or `addSpecies` / `removeSpecies` / ...,
  `learnsets: {add, remove}` (species id -> move ids, relative to the dex learnsets), `verified`
  (false = no authoritative source found; shown in the app and as a gate note) and `source`.
  Everything a manual regulation adds is also added to the gen's dex (`Extras` in `dex-sources.ts`),
  even when the pinned Showdown mod still flags it non-standard. Manual ids must exist in the
  pinned Showdown dex.

Ability legality is species-own (the dex record); there is no per-regulation ability list.
`check:data` validates the schema (ids exist in the dex, exactly one default, manual entries carry
`verified`) and compares the legal pool sizes per regulation with `HEAD` (same thresholds as the dex).

Reg M-C (Champions) is manual: pokemon-showdown 0.11.11 (the newest on npm) only has Reg M-A/M-B.
`manual.json` is derived from the `champions` (Reg M-C) vs `championsregmb` data mods on Showdown's
`master` (commit 965a535) and cross-checked against dexdb.io's Reg M-C lists. When a Showdown release
contains the M-C format: bump the pin, drop the `regmc` entry from `manual.json`, give `regmb` /
`regmc` their formats in `config.ts` (the `champions` mod becomes M-C, `championsregmb` M-B), run
`npm run build:data -- --all` and review the diff.

Downloads (untrusted, only parsed as data) go to the gitignored `.cache/build-data/downloads`;
a detailed report (missing German names, sizes) goes to `.cache/build-data/report.json`.
Typecheck all scripts with `npm run typecheck:scripts`.

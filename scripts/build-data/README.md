# scripts/build-data

`npm run build:data` (tsx; add `-- --refresh` to ignore the download cache) writes
`src/data/generated/<gen>/{dex,learnsets,sets}.json` and `generated/sources.json`.

Pipeline

1. `install-ps.ts` installs the official `pokemon-showdown` npm package into
   `.cache/build-data/ps` (gitignored, `--ignore-scripts`). Needed because `@pkmn/dex` has no
   mods for Let's Go (`gen7letsgo`), Legends Z-A (`gen9legends`) or Champions (`champions`).
2. `dex-sources.ts` - entities + learnsets: `@pkmn/dex` + `@pkmn/data` for rby..sm, swsh, sv;
   Showdown mods for lgpe, za, champions (own learnset aggregation incl. prevolutions).
3. `names.ts` - German names from PokeAPI CSVs (language 6 = de), joined on a diacritics-stripped
   name key; override/alias tables at the top of the file; forme names are derived from the base.
4. `sets.ts` - top 3 spreads per species from Smogon `chaos` stats of the VGC formats configured
   in `config.ts` (structured numbers only, no prose).
5. `index.ts` - writes JSON, search index and `sources.json`; prints counts/sizes.
   A detailed report (missing German names, sizes) goes to `.cache/build-data/report.json`.

Downloads (all untrusted, only parsed as data) go to `.cache/build-data/downloads`.
Typecheck the scripts with `npm run typecheck:data`.

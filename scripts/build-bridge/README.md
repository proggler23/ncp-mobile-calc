# scripts/build-bridge

`npm run build:bridge` (tsx) builds `src/bridge/generated/*.json` and `COVERAGE.md`. It reads
`src/data/generated/*/dex.json`, so run `npm run build:data` first (`npm run build:assets` runs
both). Add NCP <-> Showdown name exceptions in `overrides.ts`. `npm run typecheck:bridge` checks
this folder. See `src/bridge/README.md`.

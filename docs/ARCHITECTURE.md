# Architecture

A short map of how the app is put together. Module-level details live in the READMEs of each
folder (`src/engine`, `src/bridge`, `src/data`, `scripts/build-data`); data refresh and deploy are in
[MAINTENANCE.md](MAINTENANCE.md).

## Data flow of a calculation

```
SavedSet                     Showdown ids, string gen ("sv"), set body from storage or the editor
   |  bridge.toEngineInput(gen, attackerSet, defenderSet, field)
   |    maps ids to NCP display names via the generated maps (src/bridge/generated)
   |    applies the UI conveniences (auto weather/terrain, Flame Orb status, plates,
   |    Hidden Power IVs), each can be switched off in ToEngineOptions
   v
CalcInput                    NCP display names, numeric gen (1 ... 10, 7.5, 9.5)
   |  engine.calculate(input)   (after prepare(gen) has been awaited once)
   |    adapter.fillState  -> writes a FormState (values NCP would read from the form)
   |    sandbox            -> NCP's own scripts, evaluated in one scope, with a jQuery stub
   |                          that answers their reads from FormState
   |    NCP calculate()    -> damageResults, KO text
   v
CalcResult                   per move: damage rolls, description, koChance, percentRange, ...
   |
   v
UI (features/matchup)        MoveResults and PokemonCard render the result
```

Key points:

- `calculate()` is synchronous and works only from the explicit input. NCP's scripts see a stub
  of the browser globals and jQuery (`sandbox/jquery-stub.ts`), not the real DOM.
- The damage math is NCP's unmodified code (`vendor/ncp/script_res`, checked by `npm run check:vendor`).
  Local changes, if any, must be recorded as patches in `vendor/ncp-patches/`.
- Correctness is pinned by 448 golden scenarios (`src/engine/__golden__`) captured from the original
  NCP pages; they must match exactly.

## Loading and caching

- **App shell:** screens are `React.lazy` chunks (matchup, teams, menu). The shell and UI chunks are
  in the service worker precache.
- **Engine:** `prepare(gen)` evaluates NCP's scripts from three `?raw` chunks (`data`, `logic`, `za`)
  that load on first use.
- **Game data:** `loadGenData(gen)` loads each generation's `dex.json` and `learnsets.json` as separate
  chunks through `import.meta.glob`. Common sets (`sets.json`) and the per-regulation popular lists (`popular.json`, `loadPopular`) load on demand. Name maps are
  per generation (`genmap-<gen>` chunks, `prefetchGen`).
- **Precache:** the build precaches everything except the data of generations other than Champions
  (`PRECACHED_GEN` in `vite.config.ts`). Champions therefore works offline immediately.
- **Runtime cache:** other generations' `gendata-*` and `genmap-*` chunks use `CacheFirst` in the
  `gen-data-v1` cache (max 120 entries, 180 days). They are stored the first time they are opened, or
  by "Download all generations".
- **Updates:** content-hashed chunks mean an app update creates new files. When a new service worker
  takes over a page that had downloaded all generations, those downloads are marked stale and fetched
  again in the background while online (`src/pwa.ts`).

## Persistence

- Stores: `teams`, `customSets`, `settings` in the IndexedDB database `ncp-mobile-calc`
  (schema version 1, migrations in `src/storage/backend.ts`).
- Fallback: if IndexedDB is unavailable (private mode, blocked, quota), a localStorage backend with
  the `ncp:` key prefix is used.
- Values read back from storage are treated as untrusted and validated with zod
  (`src/storage/schema.ts`).
- Backup export and import (JSON) and the Showdown paste import/export go through
  `src/storage/repository.ts` and `src/storage/showdown.ts`.
- Battle state (boosts, status, HP) is not saved with sets.

## Regulations

- Data: `src/data/generated/<gen>/regulations.json` (champions: Reg M-C default, M-B, M-A; sv: Reg I
  default, G, D, C), loaded with the gen's dex (`GenData.regulations`). The synthetic "No filter"
  (`none`) is available for every gen and means the previous behaviour (everything the engine knows).
- `src/bridge/regulations.ts` (legal pool sets, defaults, `buildProblems`) and `catalog.ts`
  (`engineSpeciesList` / `movesForSpecies` take a `regulation`; learnset + regulation changes,
  intersected with the regulation's moves) are the single place that applies a regulation.
- State: `AppState.regulation` (resolved, current gen) and `regulations` (saved choice per gen, also
  in `Settings.regulations` and in backups). `setRegulation`, `setGen` resolve it; teams keep an
  optional `regulation` (absent = the active one). Pickers (species, items, moves; abilities are
  always the species' own) are strictly legal; saved builds that are not legal stay and carry a
  "not legal in Reg X" marker (`features/regulation/LegalBadge`); paste import warns but keeps them.
- UI: the regulation select sits in the top bar. At 360px the gen select, the 1v1/2v2 switch and the
  menu already fill the row (16px text, 44px targets), so below 560px it gets its own full-width row
  under them; from 560px it sits next to the gen select. Only gens with regulations show it.

## Sharing calcs

- **Trigger:** long-press (500 ms, `ui/useLongPress`) on a result row, or the "Share" button in the
  expanded details, opens `features/matchup/ShareSheet` (a normal `Dialog`, so Back closes it) with
  Share / Copy text / Copy link. Status ("-") rows can be shared too; the text is NCP's message as shown.
- **Message** (`state/share.ts`): line 1 = the row as displayed (`moveLine`), line 2 = regulation (or
  the generation label for "No filter") - format - field effects (`state/fieldSummary.ts`, shared with
  the field summary), line 3 = the link. Share uses `navigator.share({title, text: lines 1-2, url})`;
  without Web Share the full text is copied. "Copy text" copies lines 1-3, "Copy link" only the link.
- **Link:** `<origin><BASE_URL>#/c/v1.<payload>`. The payload (`src/share/codec.ts`, pure) is compact
  positional JSON (defaults omitted; nicknames and notes are never shared), deflate-raw compressed
  when `CompressionStream` exists, then base64url. `v1r.` marks the uncompressed fallback. Versions
  are append-only: old links keep decoding through their own decoder.
- **Opening:** `App` calls `openSharedLink` for `#/c/...` at start and on `hashchange`. The hash is
  replaced by `#/` first (a reload never re-applies it). Decoding is strict and never throws: token
  <= 4 KB, decompressed JSON <= 16 KB, whitelisted keys, storage zod schemas with generation-aware
  EV / AV / Stat Point caps, then a check against the generation's data. Unknown parts are dropped and
  listed as warnings. The load goes through `applyMatchupSnapshot` (switches generation, regulation,
  format and matchup in one commit, persisted like any change). `AppState.shareNotice` holds the
  Undo snapshot (in memory only) and is shown by `ShareNotice` for 8 s.
- **Preview:** `index.html` carries Open Graph / Twitter tags. `__SITE_URL__` is replaced at build
  time from `VITE_SITE_URL` (default `https://proggler23.github.io/ncp-mobile-calc/`). The image
  `public/og-image.png` (1200x630, ~60 KB) comes from `scripts/generate-og-image.mjs` and is excluded
  from the service worker precache (only crawlers fetch it).

## Generated data and provenance

- `src/data/generated/<gen>/` (dex, learnsets, sets), `src/bridge/generated/` (name maps) and
  `src/data/generated/version.json` are committed build outputs. They are never edited by hand.
- The app shows their provenance (`getDataVersionInfo()`: NCP commit, Showdown version, usage months,
  names snapshot date, build time).
- The deploy build runs with network access blocked, so it can only use committed files.

## Internationalisation

- Two dictionaries, `src/i18n/en.ts` (the source of the `Key` type) and `src/i18n/de.ts`, which is
  typed as `Dict` and therefore must contain every key. At runtime a missing value falls back to
  English and then to the key itself (`translate` in `src/i18n/index.ts`).
- Placeholders use `{name}` (for example `{gen}`, `{n}`).
- The initial language comes from the browser (`detectLang`: `de*` is German, everything else
  English); the user can change it in the menu.
- Pokémon, move, ability and item names: English from the Showdown/NCP data, German from the PokeAPI
  snapshot. A German name that is missing falls back to English.
